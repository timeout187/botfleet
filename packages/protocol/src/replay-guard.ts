/**
 * Replay protection for command messages: once a `messageId` has been
 * seen, a second delivery of the same ID is rejected rather than
 * re-applied. This is the transport-level half of idempotent command
 * handling - the control plane's reconciliation loop (Phase 9) additionally
 * dedupes by `idempotencyKey` at the domain level, since a legitimate
 * *retry* of the same logical command arrives with a new `messageId` but
 * the same `idempotencyKey`.
 *
 * This in-memory implementation is correct for a single process (e.g. one
 * agent's connection, or a single-instance control plane). A
 * multi-instance control plane needs a shared store (Redis) behind the
 * same interface - swap the implementation, not the call sites.
 */
export interface ReplayGuard {
  /** Returns true if this messageId has already been seen (i.e. this
   * delivery is a replay and should be rejected). Also records it. */
  checkAndRecord(messageId: string, receivedAt?: number): boolean;
}

export class InMemoryReplayGuard implements ReplayGuard {
  private readonly seenAt = new Map<string, number>();

  constructor(private readonly ttlMs: number = 5 * 60 * 1000) {}

  checkAndRecord(messageId: string, receivedAt: number = Date.now()): boolean {
    this.evictExpired(receivedAt);
    const alreadySeen = this.seenAt.has(messageId);
    if (!alreadySeen) {
      this.seenAt.set(messageId, receivedAt);
    }
    return alreadySeen;
  }

  private evictExpired(now: number): void {
    for (const [id, seenAt] of this.seenAt) {
      if (now - seenAt > this.ttlMs) {
        this.seenAt.delete(id);
      }
    }
  }

  /** For tests only. */
  size(): number {
    return this.seenAt.size;
  }
}
