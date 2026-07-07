import { z } from "zod";

/**
 * Every BotFleet protocol message shares this envelope. `payload` is
 * validated per message `type` by the catalogs in
 * agent-to-control-plane.ts / control-plane-to-agent.ts - this schema only
 * describes the transport-level fields every message must carry.
 *
 * `signature` is a placeholder for the authenticated-transport-context
 * requirement (Phase 4: mutual TLS or an HMAC over the canonical message
 * bytes, tied to the sender's enrolled credential) - this package only
 * reserves the field and validates its shape; it does not itself verify
 * signatures, since that requires the sender's credential material which
 * lives in the control plane's database, not in a transport-agnostic
 * protocol package.
 */
export const envelopeSchema = z.object({
  protocolVersion: z.number().int().positive(),
  messageId: z.string().uuid(),
  timestamp: z.string().datetime(),
  senderId: z.string().min(1).max(256),
  correlationId: z.string().uuid().optional(),
  type: z.string().min(1),
  payload: z.unknown(),
  signature: z.string().max(4096).optional(),
});

export type Envelope = z.infer<typeof envelopeSchema>;

export type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; reason: "malformed_envelope"; issues: string[] }
  | { ok: false; reason: "unsupported_protocol_version"; version: unknown }
  | { ok: false; reason: "unknown_message_type"; type: string }
  | { ok: false; reason: "malformed_payload"; type: string; issues: string[] };
