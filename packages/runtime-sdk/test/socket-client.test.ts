import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AgentSocketClient, type LocalMessage } from "../src/socket-client";

function tempSocketPath(): string {
  return path.join(
    os.tmpdir(),
    `botfleet-test-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
  );
}

function collectMessages(server: net.Server): LocalMessage[] {
  const received: LocalMessage[] = [];
  server.on("connection", (socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line) received.push(JSON.parse(line));
      }
    });
  });
  return received;
}

describe("AgentSocketClient (real Unix socket)", () => {
  const activeSockets: string[] = [];

  afterEach(() => {
    for (const socketPath of activeSockets.splice(0)) {
      fs.rmSync(socketPath, { force: true });
    }
  });

  it("delivers messages sent after connecting", async () => {
    const socketPath = tempSocketPath();
    activeSockets.push(socketPath);
    const server = net.createServer();
    const received = collectMessages(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const client = new AgentSocketClient({ socketPath });
    await new Promise<void>((resolve) => {
      client.connect();
      const check = setInterval(() => {
        client.send({ type: "bot.ready", payload: { botId: "b1" } });
        clearInterval(check);
        resolve();
      }, 50);
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received.some((m) => m.type === "bot.ready")).toBe(true);

    client.close();
    server.close();
  });

  it("queues messages sent before the socket exists, then flushes on connect", async () => {
    const socketPath = tempSocketPath();
    activeSockets.push(socketPath);

    const client = new AgentSocketClient({ socketPath });
    client.connect();
    // Server doesn't exist yet - these must be queued, not thrown.
    client.send({ type: "bot.log", payload: { botId: "b1", level: "info", message: "one" } });
    client.send({ type: "bot.log", payload: { botId: "b1", level: "info", message: "two" } });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const server = net.createServer();
    const received = collectMessages(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    // Give the client's backoff reconnect a chance to succeed and flush.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(received.length).toBeGreaterThanOrEqual(2);

    client.close();
    server.close();
  }, 10_000);

  it("drops the oldest queued message once the bound is exceeded", () => {
    const socketPath = tempSocketPath();
    activeSockets.push(socketPath);
    const client = new AgentSocketClient({ socketPath, maxQueueSize: 3 });
    // Never call connect() - guarantees every send() goes through the
    // disconnected queueing path deterministically for this test.
    for (let i = 0; i < 10; i++) {
      client.send({
        type: "bot.log",
        payload: { botId: "b1", level: "info", message: `msg-${i}` },
      });
    }
    // @ts-expect-error reaching into private state deliberately for this assertion
    const queue = client.queue as LocalMessage[];
    expect(queue.length).toBe(3);
    expect((queue[0].payload as { message: string }).message).toBe("msg-7");
    client.close();
  });
});
