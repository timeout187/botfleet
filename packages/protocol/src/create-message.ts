import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "./version";
import type { AgentToControlPlaneMessage, AgentToControlPlaneType } from "./agent-to-control-plane";
import type { ControlPlaneToAgentMessage, ControlPlaneToAgentType } from "./control-plane-to-agent";

interface EnvelopeFields {
  senderId: string;
  correlationId?: string;
}

type WithoutEnvelope<T> = Omit<
  T,
  "protocolVersion" | "messageId" | "timestamp" | "senderId" | "correlationId"
>;

/** Fills in the envelope fields (`protocolVersion`, `messageId`,
 * `timestamp`) so callers only ever have to specify `type`, `payload`,
 * and who's sending it - never construct these fields by hand, since
 * that's how a mismatched protocolVersion or non-unique messageId sneaks
 * in. */
export function createAgentToControlPlaneMessage(
  message: WithoutEnvelope<AgentToControlPlaneMessage>,
  envelope: EnvelopeFields,
): AgentToControlPlaneMessage & {
  protocolVersion: number;
  messageId: string;
  timestamp: string;
  senderId: string;
  correlationId?: string;
} {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    senderId: envelope.senderId,
    ...(envelope.correlationId ? { correlationId: envelope.correlationId } : {}),
    ...message,
  } as AgentToControlPlaneMessage & {
    protocolVersion: number;
    messageId: string;
    timestamp: string;
    senderId: string;
    correlationId?: string;
  };
}

export function createControlPlaneToAgentMessage(
  message: WithoutEnvelope<ControlPlaneToAgentMessage>,
  envelope: EnvelopeFields,
): ControlPlaneToAgentMessage & {
  protocolVersion: number;
  messageId: string;
  timestamp: string;
  senderId: string;
  correlationId?: string;
} {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: randomUUID(),
    timestamp: new Date().toISOString(),
    senderId: envelope.senderId,
    ...(envelope.correlationId ? { correlationId: envelope.correlationId } : {}),
    ...message,
  } as ControlPlaneToAgentMessage & {
    protocolVersion: number;
    messageId: string;
    timestamp: string;
    senderId: string;
    correlationId?: string;
  };
}

export type { AgentToControlPlaneType, ControlPlaneToAgentType };
