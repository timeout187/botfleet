import { describe, it, expect } from "vitest";
import { FixedWindowRateLimiter } from "../src/rate-limiter";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the max per window", () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(3, 1000, () => now);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(2, 1000, () => now);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
    now = 1500;
    expect(limiter.tryConsume()).toBe(true);
  });

  it("a crash-looping caller can't exceed the budget within a window", () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(5, 1000, () => now);
    let allowed = 0;
    for (let i = 0; i < 1000; i++) {
      if (limiter.tryConsume()) allowed++;
    }
    expect(allowed).toBe(5);
  });
});
