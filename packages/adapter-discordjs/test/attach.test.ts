import { describe, it, expect, vi } from "vitest";
import { Client, GatewayIntentBits } from "discord.js";
import type { BotFleetRuntime } from "@botfleet/runtime-sdk";
import { attachDiscordJs } from "../src/index";

function fakeRuntime(): BotFleetRuntime {
  return {
    start: vi.fn(),
    ready: vi.fn(),
    heartbeat: vi.fn(),
    metric: vi.fn(),
    log: vi.fn(),
    shardStatus: vi.fn(),
    crashed: vi.fn(),
    gracefulShutdown: vi.fn(),
  };
}

// These tests use a real discord.js Client (no fake/mock class) - it's
// never connected to Discord's gateway (no token, no .login()), but its
// event emitter, .guilds.cache, and .ws are all genuine discord.js
// internals. Events are emitted directly rather than arriving over a
// real gateway connection, exactly the same way the PM2 adapter's
// verification in apps/control-plane used a real spawned process with a
// placeholder script instead of a live Discord session.
describe("attachDiscordJs", () => {
  it("calls runtime.ready() with real guild/shard counts on the ready event", () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const runtime = fakeRuntime();
    attachDiscordJs(client, runtime, { heartbeatIntervalMs: 60_000 });

    client.emit("ready", client as never);

    expect(runtime.ready).toHaveBeenCalledWith(
      expect.objectContaining({ guildCount: 0, shardCount: 0 }),
    );
  });

  it("logs a warning on shardReconnecting", () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const runtime = fakeRuntime();
    attachDiscordJs(client, runtime);

    client.emit("shardReconnecting", 0);

    expect(runtime.log).toHaveBeenCalledWith("warn", expect.stringContaining("Shard 0"));
  });

  it("reports shard status on resume and disconnect", () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const runtime = fakeRuntime();
    attachDiscordJs(client, runtime);

    client.emit("shardResume", 0, 5);
    expect(runtime.shardStatus).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 0, status: "connected" }),
    );

    client.emit("shardDisconnect", { code: 1000 } as never, 0);
    expect(runtime.shardStatus).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 0, status: "disconnected" }),
    );
  });

  it("logs client errors and invalidated sessions", () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const runtime = fakeRuntime();
    attachDiscordJs(client, runtime);

    client.emit("error", new Error("boom"));
    expect(runtime.log).toHaveBeenCalledWith("error", expect.stringContaining("boom"));

    client.emit("invalidated");
    expect(runtime.log).toHaveBeenCalledWith("error", expect.stringContaining("invalidated"));
  });

  it("detach() stops the heartbeat and removes listeners", () => {
    vi.useFakeTimers();
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const runtime = fakeRuntime();
    const detach = attachDiscordJs(client, runtime, { heartbeatIntervalMs: 1000 });

    client.emit("ready", client as never);
    expect(runtime.ready).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3500);
    expect(runtime.heartbeat).toHaveBeenCalledTimes(3);

    detach();
    vi.advanceTimersByTime(10_000);
    expect(runtime.heartbeat).toHaveBeenCalledTimes(3); // no more after detach

    client.emit("shardReconnecting", 0);
    expect(runtime.log).not.toHaveBeenCalled(); // listener removed

    vi.useRealTimers();
  });
});
