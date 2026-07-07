import { describe, it, expect, vi } from "vitest";
import * as Eris from "eris";
import type { BotFleetRuntime } from "@botfleet/runtime-sdk";
import { attachEris } from "../src/index";

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

// A real Eris.Client (never connected - no token, no .connect()) so the
// adapter is exercised against genuine Eris internals (.guilds, .shards,
// its real EventEmitter), with events emitted directly instead of
// arriving over a live gateway connection.
describe("attachEris", () => {
  it("calls runtime.ready() with real guild/shard counts on the ready event", () => {
    const bot = new Eris.Client("fake-token", { intents: [] });
    const runtime = fakeRuntime();
    attachEris(bot, runtime, { heartbeatIntervalMs: 60_000 });

    bot.emit("ready");

    expect(runtime.ready).toHaveBeenCalledWith(
      expect.objectContaining({ guildCount: 0, shardCount: 0 }),
    );
  });

  it("reports shard status on shardReady, shardResume, and shardDisconnect", () => {
    const bot = new Eris.Client("fake-token", { intents: [] });
    const runtime = fakeRuntime();
    attachEris(bot, runtime);

    bot.emit("shardReady", 0);
    expect(runtime.shardStatus).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 0, status: "connected" }),
    );

    bot.emit("shardResume", 0);
    expect(runtime.shardStatus).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 0, status: "connected" }),
    );

    bot.emit("shardDisconnect", new Error("gateway closed"), 0);
    expect(runtime.shardStatus).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 0, status: "disconnected" }),
    );
    expect(runtime.log).toHaveBeenCalledWith("warn", expect.stringContaining("gateway closed"));
  });

  it("logs warn and error events", () => {
    const bot = new Eris.Client("fake-token", { intents: [] });
    const runtime = fakeRuntime();
    attachEris(bot, runtime);

    bot.emit("warn", "something odd");
    expect(runtime.log).toHaveBeenCalledWith("warn", "something odd");

    bot.emit("error", new Error("boom"));
    expect(runtime.log).toHaveBeenCalledWith("error", expect.stringContaining("boom"));
  });

  it("detach() stops the heartbeat and removes listeners", () => {
    vi.useFakeTimers();
    const bot = new Eris.Client("fake-token", { intents: [] });
    const runtime = fakeRuntime();
    const detach = attachEris(bot, runtime, { heartbeatIntervalMs: 1000 });

    bot.emit("ready");
    expect(runtime.ready).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3500);
    expect(runtime.heartbeat).toHaveBeenCalledTimes(3);

    detach();
    vi.advanceTimersByTime(10_000);
    expect(runtime.heartbeat).toHaveBeenCalledTimes(3);

    bot.emit("warn", "after detach");
    expect(runtime.log).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
