/**
 * Runner abstraction: how BotFleet actually starts/stops/restarts a bot process.
 * Real process control (spawning a Node process under PM2, or a Docker container)
 * is intentionally NOT implemented in this first pass - see PM2_ADAPTER_NOTES /
 * DOCKER_ADAPTER_NOTES in the adapter files. Every adapter method here records
 * the intent (audit log + a BotHealth status transition) so the rest of the
 * product (dashboard, alerts, worker assignment) can be built and exercised
 * against a real interface today, and wired to a real process supervisor later
 * without changing any caller.
 */
export interface RunnerAdapter {
  readonly mode: "pm2" | "docker";
  start(botId: string): Promise<void>;
  stop(botId: string): Promise<void>;
  restart(botId: string): Promise<void>;
}
