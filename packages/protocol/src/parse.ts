import { envelopeSchema, type Envelope, type ParseResult } from "./envelope";
import { isSupportedProtocolVersion } from "./version";
import {
  agentToControlPlaneMessageSchema,
  type AgentToControlPlaneMessage,
} from "./agent-to-control-plane";
import {
  controlPlaneToAgentMessageSchema,
  type ControlPlaneToAgentMessage,
} from "./control-plane-to-agent";

function parseEnvelope(raw: unknown): ParseResult<Envelope> {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "malformed_envelope",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  if (!isSupportedProtocolVersion(parsed.data.protocolVersion)) {
    return {
      ok: false,
      reason: "unsupported_protocol_version",
      version: parsed.data.protocolVersion,
    };
  }
  return { ok: true, message: parsed.data };
}

/**
 * Validates a raw, untyped value (e.g. `JSON.parse`d from a socket) as a
 * complete AgentToControlPlane envelope + payload. Never throws - every
 * failure mode is a typed `ParseResult` the caller can log/reject safely,
 * since this function's whole job is to be the boundary between
 * "arbitrary bytes from a remote agent" and "a value the control plane's
 * business logic can trust the shape of."
 */
export function parseAgentToControlPlaneMessage(
  raw: unknown,
): ParseResult<Envelope & AgentToControlPlaneMessage> {
  const envelopeResult = parseEnvelope(raw);
  if (!envelopeResult.ok) return envelopeResult;

  const messageResult = agentToControlPlaneMessageSchema.safeParse(envelopeResult.message);
  if (!messageResult.success) {
    const knownType = agentToControlPlaneMessageSchema.options.some(
      (option) => option.shape.type.value === envelopeResult.message.type,
    );
    if (!knownType) {
      return { ok: false, reason: "unknown_message_type", type: envelopeResult.message.type };
    }
    return {
      ok: false,
      reason: "malformed_payload",
      type: envelopeResult.message.type,
      issues: messageResult.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, message: { ...envelopeResult.message, ...messageResult.data } };
}

/** Same contract as parseAgentToControlPlaneMessage, for the opposite
 * direction. */
export function parseControlPlaneToAgentMessage(
  raw: unknown,
): ParseResult<Envelope & ControlPlaneToAgentMessage> {
  const envelopeResult = parseEnvelope(raw);
  if (!envelopeResult.ok) return envelopeResult;

  const messageResult = controlPlaneToAgentMessageSchema.safeParse(envelopeResult.message);
  if (!messageResult.success) {
    const knownType = controlPlaneToAgentMessageSchema.options.some(
      (option) => option.shape.type.value === envelopeResult.message.type,
    );
    if (!knownType) {
      return { ok: false, reason: "unknown_message_type", type: envelopeResult.message.type };
    }
    return {
      ok: false,
      reason: "malformed_payload",
      type: envelopeResult.message.type,
      issues: messageResult.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, message: { ...envelopeResult.message, ...messageResult.data } };
}
