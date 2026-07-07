/**
 * Bumped on any wire-incompatible change to the envelope or a message
 * payload shape. Additive changes (new optional field, new message type)
 * do not require a bump - see docs/protocol-reference.md's
 * backward-compatibility rules.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Versions this build can still understand on the wire. A control plane
 * or agent that's ahead by one major version should keep accepting the
 * previous version for the length of a deprecation window rather than
 * hard-cutting every older peer at once.
 */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [PROTOCOL_VERSION];

export function isSupportedProtocolVersion(version: number): boolean {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(version);
}
