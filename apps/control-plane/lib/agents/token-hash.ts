import { randomBytes, createHash } from "node:crypto";

/** High-entropy, URL-safe random token - used for both enrollment tokens
 * and agent bearer credentials. Never logged, never returned after the
 * one moment it's issued. */
export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** One-way SHA-256 fingerprint. Enrollment tokens and agent credentials
 * are looked up by this hash - the plaintext is never stored, so a
 * database read alone can never leak a usable secret. */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
