import { describe, it, expect } from "vitest";
import { generateRandomToken, hashToken } from "@/lib/agents/token-hash";

describe("token-hash", () => {
  it("generates high-entropy, unique tokens", () => {
    const a = generateRandomToken();
    const b = generateRandomToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("hashes deterministically (same input -> same hash)", () => {
    const token = "a-fixed-test-token";
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("never returns the plaintext back", () => {
    const token = generateRandomToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // hex-encoded SHA-256
  });
});
