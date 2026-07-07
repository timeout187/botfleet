import type { BotFleetPlugin } from "@/lib/plugins/types";
import { writeAuditLog } from "@/lib/audit";

/**
 * These wrap the existing RunnerAdapter implementations (lib/runner/*) as
 * plugins with deployment hooks, matching the "PM2 runner" / "Docker
 * runner" example plugins from the spec. The hooks are real (they write a
 * genuine audit log entry you can see at /admin/logs) but don't yet do
 * process draining/restart themselves - see lib/runner for why bot
 * start/stop/restart control is still a TODO(real-runner).
 */
export const pm2RunnerPlugin: BotFleetPlugin = {
  id: "pm2-runner",
  name: "PM2 Runner",
  description: "Runs bot processes under PM2 on a single host.",
  deploymentHooks: {
    async beforeDeploy() {
      await writeAuditLog({
        actorUserId: null,
        action: "plugin.pm2_runner.before_deploy",
        targetType: "deployment",
        targetId: "pending",
      });
    },
    async afterDeploy() {
      await writeAuditLog({
        actorUserId: null,
        action: "plugin.pm2_runner.after_deploy",
        targetType: "deployment",
        targetId: "pending",
      });
    },
  },
};

export const dockerRunnerPlugin: BotFleetPlugin = {
  id: "docker-runner",
  name: "Docker Runner",
  description: "Runs bot processes in Docker containers.",
  deploymentHooks: {
    async beforeDeploy() {
      await writeAuditLog({
        actorUserId: null,
        action: "plugin.docker_runner.before_deploy",
        targetType: "deployment",
        targetId: "pending",
      });
    },
    async afterDeploy() {
      await writeAuditLog({
        actorUserId: null,
        action: "plugin.docker_runner.after_deploy",
        targetType: "deployment",
        targetId: "pending",
      });
    },
  },
};
