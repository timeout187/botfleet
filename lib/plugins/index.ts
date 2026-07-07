import {
  registerPlugin,
  getPlugins,
  getAllDashboardCards,
  getAllHealthChecks,
  getAllAlertRules,
  getAllBotTemplates,
} from "@/lib/plugins/registry";
import { redisStatusPlugin } from "@/lib/plugins/builtin/redis-status-card";
import { pm2RunnerPlugin, dockerRunnerPlugin } from "@/lib/plugins/builtin/runner-plugins";
import { alertRulesPlugin } from "@/lib/plugins/builtin/alert-rules";
import { botTemplatesPlugin } from "@/lib/plugins/builtin/bot-templates";
import { nodeVersionCheckPlugin } from "@/lib/plugins/builtin/node-version-check";

let registered = false;

/** Idempotent - safe to call from multiple server components/route handlers. */
export function ensureBuiltinPluginsRegistered(): void {
  if (registered) return;
  registered = true;
  for (const plugin of [
    redisStatusPlugin,
    pm2RunnerPlugin,
    dockerRunnerPlugin,
    alertRulesPlugin,
    botTemplatesPlugin,
    nodeVersionCheckPlugin,
  ]) {
    registerPlugin(plugin);
  }
}

export {
  getPlugins,
  getAllDashboardCards,
  getAllHealthChecks,
  getAllAlertRules,
  getAllBotTemplates,
};
