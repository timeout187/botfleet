import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  parseAgentToControlPlaneMessage,
  parseControlPlaneToAgentMessage,
  createAgentToControlPlaneMessage,
  createControlPlaneToAgentMessage,
  PROTOCOL_VERSION,
} from "../src/index";

function validHeartbeat() {
  return createAgentToControlPlaneMessage(
    {
      type: "agent.heartbeat",
      payload: {
        agentId: "agent-1",
        status: "online",
        resources: {
          cpuUsagePercent: 12.5,
          memoryTotalMb: 4096,
          memoryAvailableMb: 2048,
        },
        workloadCount: 3,
      },
    },
    { senderId: "agent-1" },
  );
}

describe("parseAgentToControlPlaneMessage", () => {
  it("accepts a well-formed message", () => {
    const result = parseAgentToControlPlaneMessage(validHeartbeat());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.type).toBe("agent.heartbeat");
    }
  });

  it("rejects a malformed envelope (missing messageId)", () => {
    const message = validHeartbeat() as Record<string, unknown>;
    delete message.messageId;
    const result = parseAgentToControlPlaneMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_envelope");
  });

  it("rejects an unsupported protocol version", () => {
    const message = { ...validHeartbeat(), protocolVersion: PROTOCOL_VERSION + 999 };
    const result = parseAgentToControlPlaneMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported_protocol_version");
  });

  it("rejects an unknown message type", () => {
    const message = { ...validHeartbeat(), type: "agent.made_up_type" };
    const result = parseAgentToControlPlaneMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown_message_type");
  });

  it("rejects a known type with a malformed payload", () => {
    const message = validHeartbeat();
    // @ts-expect-error deliberately corrupting the payload for the test
    message.payload.workloadCount = "not-a-number";
    const result = parseAgentToControlPlaneMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_payload");
  });

  it("rejects arbitrary garbage without throwing", () => {
    expect(() => parseAgentToControlPlaneMessage({ garbage: true })).not.toThrow();
    expect(() => parseAgentToControlPlaneMessage(null)).not.toThrow();
    expect(() => parseAgentToControlPlaneMessage("not even an object")).not.toThrow();
  });

  it("caps bot.log message size", () => {
    const message = createAgentToControlPlaneMessage(
      { type: "bot.log", payload: { botId: "bot-1", level: "info", message: "x".repeat(3000) } },
      { senderId: "agent-1" },
    );
    const result = parseAgentToControlPlaneMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_payload");
  });
});

describe("parseControlPlaneToAgentMessage", () => {
  it("accepts a well-formed command with an idempotency key", () => {
    const message = createControlPlaneToAgentMessage(
      {
        type: "bot.restart",
        payload: { workloadId: "wl-1", botId: "bot-1", idempotencyKey: randomUUID() },
      },
      { senderId: "control-plane" },
    );
    const result = parseControlPlaneToAgentMessage(message);
    expect(result.ok).toBe(true);
  });

  it("rejects bot.restart missing the required idempotencyKey", () => {
    const message = createControlPlaneToAgentMessage(
      { type: "bot.restart", payload: { workloadId: "wl-1", botId: "bot-1", idempotencyKey: "k" } },
      { senderId: "control-plane" },
    );
    // @ts-expect-error deliberately corrupting the payload for the test
    delete message.payload.idempotencyKey;
    const result = parseControlPlaneToAgentMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_payload");
  });

  it("round-trips every declared message type through create+parse", () => {
    const samples: Array<[string, unknown]> = [
      [
        "agent.accepted",
        { agentId: "a1", agentCredentialFingerprint: "fp", heartbeatIntervalMs: 5000 },
      ],
      ["worker.drain", { agentId: "a1", mode: "graceful", idempotencyKey: "k1" }],
      ["deployment.execute", { deploymentId: "d1", workloadId: "wl1", idempotencyKey: "k2" }],
    ];
    for (const [type, payload] of samples) {
      const message = createControlPlaneToAgentMessage({ type, payload } as never, {
        senderId: "control-plane",
      });
      const result = parseControlPlaneToAgentMessage(message);
      expect(result.ok, `${type} should parse`).toBe(true);
    }
  });
});
