/**
 * Standalone BotFleet agent process. Connects outbound to the control
 * plane's agent gateway (apps/control-plane/lib/agent-gateway/server.ts) -
 * no inbound port on this side is ever required. First run: enrolls with
 * BOTFLEET_AGENT_ENROLLMENT_TOKEN and persists the issued credential
 * locally (see ./state.ts). Every run after that: reconnects using the
 * persisted credential, no token needed. Reconnects with exponential
 * backoff + jitter on any disconnect; never gives up.
 */
import "dotenv/config";
import os from "node:os";
import { WebSocket } from "ws";
import {
  createAgentToControlPlaneMessage,
  parseControlPlaneToAgentMessage,
} from "@botfleet/protocol";
import { loadConfig } from "./config";
import { loadState, saveState } from "./state";
import { sampleResources } from "./resources";

const config = loadConfig();

let ws: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempt = 0;
let shuttingDown = false;
let agentId: string | null = null;

function log(message: string): void {
  console.log(`[agent] ${message}`);
}

function backoffDelayMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  const jitter = Math.random() * base * 0.3;
  return Math.round(base + jitter);
}

function connect(): void {
  if (shuttingDown) return;

  const state = loadState(config.stateFilePath);
  const headers: Record<string, string> = {};
  if (state) {
    headers.Authorization = `Bearer ${state.agentId}:${state.credentialSecret}`;
    agentId = state.agentId;
  }

  log(`connecting to ${config.controlPlaneUrl} (${state ? "reconnect" : "enrolling"})`);
  const socket = new WebSocket(config.controlPlaneUrl, { headers });
  ws = socket;

  socket.on("open", () => {
    reconnectAttempt = 0;
    if (state) {
      log(`connected as agent ${state.agentId}`);
      startHeartbeatLoop();
      return;
    }
    if (!config.enrollmentToken) {
      log("no local state and BOTFLEET_AGENT_ENROLLMENT_TOKEN is not set - cannot enroll");
      socket.close();
      return;
    }
    const enroll = createAgentToControlPlaneMessage(
      {
        type: "agent.enroll",
        payload: {
          enrollmentToken: config.enrollmentToken,
          agentName: config.agentName,
          hostname: os.hostname(),
          architecture: process.arch,
          operatingSystem: `${os.type()} ${os.release()}`,
          agentVersion: config.agentVersion,
          capabilities: config.capabilities,
          labels: config.labels,
        },
      },
      { senderId: config.agentName },
    );
    socket.send(JSON.stringify(enroll));
  });

  socket.on("message", (raw: Buffer) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const result = parseControlPlaneToAgentMessage(parsedJson);
    if (!result.ok) {
      log(`received invalid message: ${result.reason}`);
      return;
    }
    const message = result.message;
    if (message.type === "agent.accepted") {
      agentId = message.payload.agentId;
      if (message.payload.credentialSecret) {
        saveState(config.stateFilePath, {
          agentId: message.payload.agentId,
          credentialSecret: message.payload.credentialSecret,
        });
        log(`enrolled as agent ${agentId}`);
      }
      startHeartbeatLoop();
    }
  });

  socket.on("close", (code: number, reason: Buffer) => {
    stopHeartbeatLoop();
    if (shuttingDown) return;
    const delay = backoffDelayMs(reconnectAttempt++);
    log(
      `disconnected (code=${code}${reason.length ? ` reason=${reason.toString()}` : ""}) - reconnecting in ${delay}ms`,
    );
    setTimeout(connect, delay);
  });

  socket.on("error", (err: Error) => {
    log(`connection error: ${err.message}`);
  });
}

function startHeartbeatLoop(): void {
  stopHeartbeatLoop();
  const sendHeartbeat = async () => {
    if (!agentId || ws?.readyState !== WebSocket.OPEN) return;
    const resources = await sampleResources();
    const heartbeat = createAgentToControlPlaneMessage(
      {
        type: "agent.heartbeat",
        payload: { agentId, status: "online", resources, workloadCount: 0 },
      },
      { senderId: agentId },
    );
    ws.send(JSON.stringify(heartbeat));
  };
  void sendHeartbeat();
  heartbeatTimer = setInterval(() => void sendHeartbeat(), 15_000);
}

function stopHeartbeatLoop(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function shutdown(): void {
  shuttingDown = true;
  stopHeartbeatLoop();
  ws?.close();
  log("shut down cleanly");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

connect();
