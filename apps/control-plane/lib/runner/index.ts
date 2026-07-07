import { pm2Adapter } from "@/lib/runner/pm2-adapter";
import { dockerAdapter } from "@/lib/runner/docker-adapter";
import type { RunnerAdapter } from "@/lib/runner/types";

export type { RunnerAdapter };

export function getRunnerAdapter(mode: "pm2" | "docker" = "pm2"): RunnerAdapter {
  return mode === "docker" ? dockerAdapter : pm2Adapter;
}
