/**
 * Local Unix socket IPC server bot processes connect to (via
 * @botfleet/runtime-sdk) to report their own status - this is the "no
 * control-plane credentials exposed to bot code" boundary the mission
 * requires: a bot process only ever knows this socket path, never the
 * agent's own WebSocket connection, credential, or the control plane's
 * address.
 */
import net from "node:net";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  parseAgentToControlPlaneMessage,
  PROTOCOL_VERSION,
  type AgentToControlPlaneType,
} from "@botfleet/protocol";

const ALLOWED_LOCAL_TYPES = new Set<AgentToControlPlaneType>([
  "bot.ready",
  "bot.heartbeat",
  "bot.stopped",
  "bot.crashed",
  "bot.metrics",
  "bot.log",
  "shard.status",
]);

export type ForwardFn = (type: AgentToControlPlaneType, payload: unknown) => void;

export function startLocalIpcServer(socketPath: string, forward: ForwardFn): net.Server {
  // A Unix socket file left behind by a crashed previous run blocks
  // binding a new listener to the same path - safe to remove, since a
  // stale file (no listener behind it) can't be an active connection.
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Didn't exist - fine.
  }

  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line) handleLine(line, forward);
      }
    });
    socket.on("error", () => {
      // A misbehaving/disconnecting bot process must never take the
      // agent process down with it.
    });
  });

  server.listen(socketPath, () => {
    fs.chmodSync(socketPath, 0o600);
  });

  return server;
}

function handleLine(line: string, forward: ForwardFn): void {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(line);
  } catch {
    return;
  }
  if (typeof parsedJson !== "object" || parsedJson === null) return;
  const { type, payload } = parsedJson as { type?: unknown; payload?: unknown };

  if (typeof type !== "string" || !ALLOWED_LOCAL_TYPES.has(type as AgentToControlPlaneType)) {
    console.warn(`[agent] local IPC: rejected disallowed message type "${String(type)}"`);
    return;
  }

  // Validate the full shape by wrapping it in a throwaway envelope and
  // reusing the exact schema the control plane will check again once
  // this is forwarded - a malformed payload is caught here, with a clear
  // local log line, rather than silently dropped three hops away.
  const candidateEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    senderId: "local-bot-process",
    type,
    payload,
  };
  const result = parseAgentToControlPlaneMessage(candidateEnvelope);
  if (!result.ok) {
    console.warn(`[agent] local IPC: rejected malformed "${type}" message: ${result.reason}`);
    return;
  }

  forward(type as AgentToControlPlaneType, payload);
}
