import { z } from "zod";

export const WORKLOAD_SPEC_API_VERSION = "botfleet.io/v1";

/** Command + argument array only - never a raw shell string. This is the
 * single most important guarantee this schema makes: nothing downstream
 * (the agent's runner) ever passes user-controlled input through a shell,
 * so there's no command-injection surface here by construction. */
const runtimeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("node"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    workingDirectory: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("docker"),
    image: z.string().min(1),
    args: z.array(z.string()).default([]),
  }),
]);
export type WorkloadRuntime = z.infer<typeof runtimeSchema>;

const envVarSchema = z.object({
  name: z.string().min(1).max(128),
  /** A literal value, or a reference to a secret the agent resolves
   * locally - never both, and never a value that's actually the secret
   * itself when `secretRef` is used. */
  value: z.string().max(4096).optional(),
  secretRef: z.string().max(256).optional(),
});
export type WorkloadEnvVar = z.infer<typeof envVarSchema>;

const runnerSchema = z.object({
  type: z.enum(["pm2", "docker", "node"]),
});

const resourcesSchema = z.object({
  memoryMb: z.number().int().positive().max(65536).optional(),
  cpuShares: z.number().int().positive().max(64).optional(),
});

const restartPolicySchema = z.enum(["always", "on-failure", "never"]);
export type RestartPolicy = z.infer<typeof restartPolicySchema>;

const healthSchema = z.object({
  startupTimeoutSeconds: z.number().int().positive().max(3600).default(60),
  heartbeatTimeoutSeconds: z.number().int().positive().max(3600).default(30),
  gracefulShutdownTimeoutSeconds: z.number().int().positive().max(300).default(10),
  restartPolicy: restartPolicySchema.default("on-failure"),
  maxRestartAttempts: z.number().int().nonnegative().max(100).default(5),
});

const placementSchema = z.object({
  requiredLabels: z.record(z.string(), z.string()).default({}),
  preferredLabels: z.record(z.string(), z.string()).default({}),
});

const workloadSpecBodySchema = z.object({
  runtime: runtimeSchema,
  runner: runnerSchema,
  env: z.array(envVarSchema).max(100).default([]),
  resources: resourcesSchema.optional().default({}),
  health: healthSchema.optional().default({
    startupTimeoutSeconds: 60,
    heartbeatTimeoutSeconds: 30,
    gracefulShutdownTimeoutSeconds: 10,
    restartPolicy: "on-failure",
    maxRestartAttempts: 5,
  }),
  placement: placementSchema.optional().default({ requiredLabels: {}, preferredLabels: {} }),
});

export const workloadSpecSchema = z.object({
  apiVersion: z.literal(WORKLOAD_SPEC_API_VERSION),
  kind: z.literal("DiscordBot"),
  metadata: z.object({
    name: z.string().min(1).max(128),
  }),
  spec: workloadSpecBodySchema,
});

export type WorkloadSpec = z.infer<typeof workloadSpecSchema>;

export type WorkloadSpecParseResult =
  { ok: true; spec: WorkloadSpec } | { ok: false; issues: string[] };

/**
 * The only supported entry point for turning an admin-provided or
 * database-stored JSON value into a trusted `WorkloadSpec`. Never throws;
 * every rejection is a list of human-readable issue strings, never a raw
 * Zod error object.
 */
export function parseWorkloadSpec(raw: unknown): WorkloadSpecParseResult {
  const result = workloadSpecSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  return { ok: true, spec: result.data };
}
