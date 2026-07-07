import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getMasterKey(): Buffer {
  const key = process.env.BOTFLEET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "BOTFLEET_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "BOTFLEET_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key).",
    );
  }
  return buf;
}

/**
 * Encrypts a secret (e.g. a Discord bot token) for storage at rest.
 * Output format: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext).
 * Never log or return the plaintext input outside the trusted backend/worker runtime.
 */
export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ".",
  );
}

export function decryptSecret(encrypted: string): string {
  const key = getMasterKey();
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Masks a raw secret for display in the admin UI - never shows more than the last 4 characters. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "*".repeat(plaintext.length);
  return `${"*".repeat(Math.min(plaintext.length - 4, 20))}${plaintext.slice(-4)}`;
}

export function isEncryptionKeyConfigured(): boolean {
  const key = process.env.BOTFLEET_ENCRYPTION_KEY;
  if (!key) return false;
  try {
    return Buffer.from(key, "base64").length === 32;
  } catch {
    return false;
  }
}
