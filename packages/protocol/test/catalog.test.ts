import { describe, it, expect } from "vitest";
import { AGENT_TO_CONTROL_PLANE_TYPES, CONTROL_PLANE_TO_AGENT_TYPES } from "../src/index";

const EXPECTED_AGENT_TO_CONTROL_PLANE = [
  "agent.enroll",
  "agent.heartbeat",
  "agent.inventory",
  "agent.metrics",
  "agent.command_ack",
  "agent.command_result",
  "bot.status",
  "bot.heartbeat",
  "bot.ready",
  "bot.stopped",
  "bot.crashed",
  "bot.metrics",
  "bot.log",
  "shard.status",
  "deployment.progress",
  "deployment.result",
].sort();

const EXPECTED_CONTROL_PLANE_TO_AGENT = [
  "agent.accepted",
  "agent.rotate_certificate",
  "bot.start",
  "bot.stop",
  "bot.restart",
  "bot.move",
  "bot.update",
  "worker.drain",
  "deployment.prepare",
  "deployment.execute",
  "deployment.rollback",
  "configuration.refresh",
].sort();

describe("message catalog completeness", () => {
  it("implements every AgentToControlPlane message type the mission specified", () => {
    expect([...AGENT_TO_CONTROL_PLANE_TYPES].sort()).toEqual(EXPECTED_AGENT_TO_CONTROL_PLANE);
  });

  it("implements every ControlPlaneToAgent message type the mission specified", () => {
    expect([...CONTROL_PLANE_TO_AGENT_TYPES].sort()).toEqual(EXPECTED_CONTROL_PLANE_TO_AGENT);
  });
});
