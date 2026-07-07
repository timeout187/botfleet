/**
 * Fixed-window rate limiter: allows at most `maxPerWindow` calls to
 * `tryConsume()` per `windowMs`, returning false (drop, don't queue) once
 * the window's budget is spent. Used to cap log/metric emission from bot
 * code - a bot logging in a tight crash loop must never be able to flood
 * the agent's local socket or the control plane's database.
 */
export class FixedWindowRateLimiter {
  private windowStart: number;
  private count = 0;

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.windowStart = this.now();
  }

  tryConsume(): boolean {
    const current = this.now();
    if (current - this.windowStart >= this.windowMs) {
      this.windowStart = current;
      this.count = 0;
    }
    if (this.count >= this.maxPerWindow) {
      return false;
    }
    this.count += 1;
    return true;
  }
}
