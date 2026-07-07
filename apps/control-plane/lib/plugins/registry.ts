import type { BotFleetPlugin } from "@/lib/plugins/types";

/**
 * The full plugin surface area (module 14 of the original spec): plugins
 * can contribute dashboard cards, health checks, alert rules, bot
 * templates, and deployment hooks. Built-in plugins live in
 * lib/plugins/builtin/* and are registered in lib/plugins/index.ts -
 * nothing here is BotFleet-core-only; a third-party plugin implementing
 * BotFleetPlugin and calling registerPlugin() plugs into the exact same
 * dashboard cards, /admin/security checks, and alert evaluation as the
 * built-ins.
 */
const plugins: BotFleetPlugin[] = [];

export function registerPlugin(plugin: BotFleetPlugin): void {
  if (plugins.some((p) => p.id === plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered`);
  }
  plugins.push(plugin);
}

export function getPlugins(): BotFleetPlugin[] {
  return plugins;
}

export function getAllDashboardCards() {
  return plugins.flatMap((p) => p.dashboardCards ?? []);
}

export function getAllHealthChecks() {
  return plugins.flatMap((p) => p.healthChecks ?? []);
}

export function getAllAlertRules() {
  return plugins.flatMap((p) => p.alertRules ?? []);
}

export function getAllBotTemplates() {
  return plugins.flatMap((p) => p.botTemplates ?? []);
}
