import { describe, it, expect } from "vitest";
import { InMemoryReplayGuard } from "../src/index";

describe("InMemoryReplayGuard", () => {
  it("lets a message id through the first time, rejects the second", () => {
    const guard = new InMemoryReplayGuard();
    expect(guard.checkAndRecord("m1")).toBe(false);
    expect(guard.checkAndRecord("m1")).toBe(true);
  });

  it("treats different ids independently", () => {
    const guard = new InMemoryReplayGuard();
    expect(guard.checkAndRecord("m1")).toBe(false);
    expect(guard.checkAndRecord("m2")).toBe(false);
    expect(guard.checkAndRecord("m1")).toBe(true);
    expect(guard.checkAndRecord("m2")).toBe(true);
  });

  it("evicts entries older than the TTL", () => {
    const guard = new InMemoryReplayGuard(1000);
    expect(guard.checkAndRecord("m1", 0)).toBe(false);
    expect(guard.size()).toBe(1);
    // Same id, well past the TTL - should be treated as new again, and the
    // stale entry should be evicted rather than accumulate forever.
    expect(guard.checkAndRecord("m1", 5000)).toBe(false);
    expect(guard.size()).toBe(1);
  });
});
