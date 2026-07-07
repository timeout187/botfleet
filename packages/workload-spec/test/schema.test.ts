import { describe, it, expect } from "vitest";
import { parseWorkloadSpec, WORKLOAD_SPEC_API_VERSION } from "../src/index";

function validSpec() {
  return {
    apiVersion: WORKLOAD_SPEC_API_VERSION,
    kind: "DiscordBot",
    metadata: { name: "example-bot" },
    spec: {
      runtime: {
        type: "node",
        command: "node",
        args: ["dist/index.js"],
        workingDirectory: "/opt/bots/example",
      },
      runner: { type: "pm2" },
      resources: { memoryMb: 512, cpuShares: 1 },
      health: {
        startupTimeoutSeconds: 60,
        heartbeatTimeoutSeconds: 30,
        restartPolicy: "on-failure",
        maxRestartAttempts: 5,
      },
      placement: {
        requiredLabels: { region: "eu-central" },
        preferredLabels: { runner: "pm2" },
      },
    },
  };
}

describe("parseWorkloadSpec", () => {
  it("accepts a well-formed spec matching the mission's example", () => {
    const result = parseWorkloadSpec(validSpec());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.spec.runtime).toEqual(
        expect.objectContaining({ type: "node", command: "node" }),
      );
    }
  });

  it("applies defaults for omitted optional sections", () => {
    const minimal = {
      apiVersion: WORKLOAD_SPEC_API_VERSION,
      kind: "DiscordBot",
      metadata: { name: "minimal-bot" },
      spec: {
        runtime: { type: "node", command: "node", args: ["index.js"] },
        runner: { type: "pm2" },
      },
    };
    const result = parseWorkloadSpec(minimal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.spec.health.restartPolicy).toBe("on-failure");
      expect(result.spec.spec.health.maxRestartAttempts).toBe(5);
      expect(result.spec.spec.placement.requiredLabels).toEqual({});
    }
  });

  it("rejects an unsupported apiVersion", () => {
    const spec = { ...validSpec(), apiVersion: "botfleet.io/v2" };
    const result = parseWorkloadSpec(spec);
    expect(result.ok).toBe(false);
  });

  it("rejects a docker runtime with no image", () => {
    const spec = validSpec();
    (spec.spec.runtime as Record<string, unknown>) = { type: "docker", args: [] };
    const result = parseWorkloadSpec(spec);
    expect(result.ok).toBe(false);
  });

  it("never accepts a raw shell string in place of command+args", () => {
    // There is no schema field that accepts a single shell string at
    // all - the closest a caller could get is passing one as `command`
    // with no args, which is still just an argv[0] to spawn(), never
    // interpreted by a shell.
    const spec = validSpec();
    (spec.spec.runtime as Record<string, unknown>).shellCommand = "rm -rf /; node index.js";
    const result = parseWorkloadSpec(spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("shellCommand" in result.spec.spec.runtime).toBe(false);
    }
  });

  it("rejects malformed input without throwing", () => {
    expect(() => parseWorkloadSpec(null)).not.toThrow();
    expect(() => parseWorkloadSpec("garbage")).not.toThrow();
    expect(() => parseWorkloadSpec({})).not.toThrow();
    expect(parseWorkloadSpec(undefined).ok).toBe(false);
  });

  it("caps resource values to sane bounds", () => {
    const spec = validSpec();
    spec.spec.resources.memoryMb = 999_999_999;
    const result = parseWorkloadSpec(spec);
    expect(result.ok).toBe(false);
  });
});
