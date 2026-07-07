/**
 * Standalone WebSocket server BotFleet agents connect outbound to (see
 * apps/agent). Run separately from the Next.js web process
 * (`npm run agent-gateway`), the same way `worker:ai` is - a persistent
 * socket server doesn't fit Next.js App Router's request/response model,
 * so this is a plain `http` + `ws` server sharing the same database.
 *
 * Auth model (see lib/agents/credential.ts for the full disclosure): an
 * agent with a previously-issued credential presents it as
 * `Authorization: Bearer <agentId>:<secret>` during the WebSocket
 * handshake, verified *before* the upgrade completes - an invalid or
 * missing credential still gets a socket, but that socket is only ever
 * allowed to send exactly one message type: `agent.enroll`, carrying a
 * fresh single-use enrollment token. Every other message on an
 * unauthenticated connection is dropped and logged, never processed.
 */
import "dotenv/config";
import http from "node:http";
import { Worker } from "bullmq";
import { WebSocketServer, type WebSocket } from "ws";
import {
  parseAgentToControlPlaneMessage,
  createControlPlaneToAgentMessage,
  InMemoryReplayGuard,
  PROTOCOL_VERSION,
  type AgentToControlPlaneMessage,
} from "@botfleet/protocol";
import { db } from "@/lib/db";
import { consumeEnrollmentToken, restrictionsSatisfied } from "@/lib/agents/enrollment";
import { agentCredentialProvider } from "@/lib/agents/credential";
import { writeAuditLog } from "@/lib/audit";
import { AgentStatus, AgentCommandStatus, Prisma } from "@/app/generated/prisma/client";
import { getQueueConnection } from "@/lib/queue/connection";
import {
  AGENT_COMMAND_QUEUE_NAME,
  type AgentCommandJobData,
} from "@/lib/queue/agent-command-queue";

const PORT = Number(process.env.AGENT_GATEWAY_PORT ?? 4010);
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

const replayGuard = new InMemoryReplayGuard();

/**
 * Live WebSocket connections, keyed by agentId - this is the piece that
 * lets a command created in the Next.js API process (a different OS
 * process from this one) actually reach a specific agent: the API route
 * enqueues a job on AGENT_COMMAND_QUEUE_NAME, and the Worker below (this
 * process) looks up the connection here and sends over it.
 */
const liveConnections = new Map<string, WebSocket>();

interface ConnectionState {
  agentId: string | null;
  authenticated: boolean;
  lastHeartbeatAt: number;
}

type EnrollPayload = Extract<AgentToControlPlaneMessage, { type: "agent.enroll" }>["payload"];
type HeartbeatPayload = Extract<AgentToControlPlaneMessage, { type: "agent.heartbeat" }>["payload"];

const server = http.createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (request, socket, head) => {
  const state: ConnectionState = {
    agentId: null,
    authenticated: false,
    lastHeartbeatAt: Date.now(),
  };

  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const [agentId, secret] = authHeader.slice("Bearer ".length).split(":");
    if (agentId && secret && (await agentCredentialProvider.verify(agentId, secret))) {
      state.agentId = agentId;
      state.authenticated = true;
      await db.agent
        .update({ where: { id: agentId }, data: { status: AgentStatus.online } })
        .catch(() => {});
    }
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, state);
  });
});

wss.on("connection", (ws: WebSocket, state: ConnectionState) => {
  if (state.authenticated && state.agentId) {
    liveConnections.set(state.agentId, ws);
  }

  const heartbeatMonitor = setInterval(() => {
    void checkHeartbeatTimeout(state);
  }, HEARTBEAT_INTERVAL_MS);

  ws.on("message", (raw: Buffer) => {
    void handleMessage(ws, state, raw);
  });

  ws.on("close", () => {
    clearInterval(heartbeatMonitor);
    if (state.agentId) {
      if (liveConnections.get(state.agentId) === ws) {
        liveConnections.delete(state.agentId);
      }
      db.agent
        .update({ where: { id: state.agentId }, data: { status: AgentStatus.disconnected } })
        .catch(() => {});
    }
  });
});

async function checkHeartbeatTimeout(state: ConnectionState): Promise<void> {
  if (!state.agentId) return;
  if (Date.now() - state.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS) return;
  await db.agent
    .update({ where: { id: state.agentId }, data: { status: AgentStatus.disconnected } })
    .catch(() => {});
}

async function handleMessage(ws: WebSocket, state: ConnectionState, raw: Buffer): Promise<void> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString());
  } catch {
    return;
  }

  const result = parseAgentToControlPlaneMessage(parsedJson);
  if (!result.ok) {
    console.warn(`[agent-gateway] rejected message: ${result.reason}`);
    return;
  }
  const message = result.message;

  if (replayGuard.checkAndRecord(message.messageId)) {
    console.warn(`[agent-gateway] replayed messageId ${message.messageId} rejected`);
    return;
  }

  if (!state.authenticated) {
    if (message.type !== "agent.enroll") {
      console.warn(`[agent-gateway] unauthenticated connection sent "${message.type}", dropping`);
      return;
    }
    await handleEnroll(ws, state, message.payload);
    return;
  }

  state.lastHeartbeatAt = Date.now();
  switch (message.type) {
    case "agent.heartbeat":
      await handleHeartbeat(state, message.payload);
      break;
    case "agent.command_ack":
      await db.agentCommand
        .updateMany({
          where: {
            idempotencyKey: message.payload.idempotencyKey,
            status: AgentCommandStatus.pending,
          },
          data: { status: AgentCommandStatus.accepted, acceptedAt: new Date() },
        })
        .catch(() => {});
      break;
    case "agent.command_result":
      await db.agentCommand
        .updateMany({
          where: { idempotencyKey: message.payload.idempotencyKey },
          data:
            message.payload.status === "succeeded"
              ? { status: AgentCommandStatus.succeeded, completedAt: new Date() }
              : {
                  status: AgentCommandStatus.failed,
                  failedAt: new Date(),
                  safeError: message.payload.safeError ?? null,
                },
        })
        .catch(() => {});
      break;
    default:
      // agent.inventory/metrics and bot.*/shard.*/deployment.* messages
      // are handled once the scheduler/reconciliation phases exist to act
      // on them - logged, not silently dropped.
      console.log(
        `[agent-gateway] received "${message.type}" from ${state.agentId} (not yet handled)`,
      );
  }
}

async function handleEnroll(
  ws: WebSocket,
  state: ConnectionState,
  payload: EnrollPayload,
): Promise<void> {
  const agent = await db.agent.create({
    data: {
      name: payload.agentName,
      status: AgentStatus.enrolling,
      protocolVersion: PROTOCOL_VERSION,
      agentVersion: payload.agentVersion,
      environment: payload.labels.environment ?? null,
      region: payload.labels.region ?? null,
      labelsJson: payload.labels as Prisma.InputJsonValue,
      capabilitiesJson: payload.capabilities as Prisma.InputJsonValue,
      hostname: payload.hostname,
      architecture: payload.architecture,
      operatingSystem: payload.operatingSystem,
    },
  });

  const consumeResult = await consumeEnrollmentToken(payload.enrollmentToken, agent.id);
  if (!consumeResult.ok) {
    await db.agent.delete({ where: { id: agent.id } });
    console.warn(`[agent-gateway] enrollment failed: ${consumeResult.reason}`);
    ws.close(4001, `enrollment_failed:${consumeResult.reason}`);
    return;
  }

  // The token is already consumed at this point even if the restriction
  // check below fails - a mismatched agent burns the single-use token
  // rather than getting to retry against the same one.
  if (!restrictionsSatisfied(consumeResult.restrictions, payload.labels)) {
    await db.agent.delete({ where: { id: agent.id } });
    console.warn(`[agent-gateway] enrollment rejected: labels don't satisfy token restrictions`);
    ws.close(4003, "enrollment_failed:restrictions_not_satisfied");
    return;
  }

  const credential = await agentCredentialProvider.issue(agent.id);
  await db.agent.update({
    where: { id: agent.id },
    data: { status: AgentStatus.online, lastHeartbeatAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: null,
    action: "agent.enrolled",
    targetType: "agent",
    targetId: agent.id,
    metadata: { hostname: payload.hostname, capabilities: payload.capabilities },
  });

  state.agentId = agent.id;
  state.authenticated = true;
  state.lastHeartbeatAt = Date.now();
  liveConnections.set(agent.id, ws);

  const accepted = createControlPlaneToAgentMessage(
    {
      type: "agent.accepted",
      payload: {
        agentId: agent.id,
        agentCredentialFingerprint: credential.fingerprint,
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
        credentialSecret: credential.secret,
      },
    },
    { senderId: "control-plane" },
  );
  ws.send(JSON.stringify(accepted));
  console.log(`[agent-gateway] agent ${agent.id} (${payload.agentName}) enrolled`);
}

async function handleHeartbeat(state: ConnectionState, payload: HeartbeatPayload): Promise<void> {
  if (!state.agentId || payload.agentId !== state.agentId) {
    console.warn(
      `[agent-gateway] heartbeat agentId mismatch (connection=${state.agentId}, payload=${payload.agentId})`,
    );
    return;
  }
  await db.agent.update({
    where: { id: state.agentId },
    data: {
      status: AgentStatus.online,
      lastHeartbeatAt: new Date(),
      cpuUsagePercent: payload.resources.cpuUsagePercent,
      totalMemoryMb: payload.resources.memoryTotalMb,
      availableMemoryMb: payload.resources.memoryAvailableMb,
      diskTotalMb: payload.resources.diskTotalMb,
      diskAvailableMb: payload.resources.diskAvailableMb,
    },
  });
}

/**
 * Consumes commands enqueued by API routes (a different OS process) and
 * delivers them to the target agent's live connection, if it has one.
 * Marks the AgentCommand failed immediately (rather than leaving it
 * `pending` forever) when the agent isn't currently connected - a real,
 * observable outcome instead of a silent no-op.
 */
const commandWorker = new Worker<AgentCommandJobData>(
  AGENT_COMMAND_QUEUE_NAME,
  async (job) => {
    const ws = liveConnections.get(job.data.agentId);
    if (!ws || ws.readyState !== ws.OPEN) {
      const payload = job.data.message as { payload?: { idempotencyKey?: string } };
      await db.agentCommand
        .updateMany({
          where: { idempotencyKey: payload.payload?.idempotencyKey },
          data: {
            status: AgentCommandStatus.failed,
            failedAt: new Date(),
            safeError: "Agent is not currently connected",
          },
        })
        .catch(() => {});
      return { delivered: false };
    }
    ws.send(JSON.stringify(job.data.message));
    return { delivered: true };
  },
  { connection: getQueueConnection(), concurrency: 5 },
);

commandWorker.on("failed", (job, err) => {
  console.error(`[agent-gateway] command dispatch failed for job ${job?.id}:`, err.message);
});

server.listen(PORT, () => {
  console.log(`[agent-gateway] listening on :${PORT}`);
  console.log(`[agent-gateway] command dispatcher listening on "${AGENT_COMMAND_QUEUE_NAME}"`);
});
