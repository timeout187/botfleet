import fs from "node:fs";

/**
 * The agent's own connection credential (not a bot token - see
 * docs/distributed-audit.md's token lifecycle section for that
 * distinction). Persisted so the agent can reconnect after a restart
 * without needing a fresh enrollment token every time. Written with mode
 * 0600 (owner read/write only) - still a plaintext-on-disk secret, which
 * is exactly why lib/agents/credential.ts on the control-plane side is
 * documented as a disclosed placeholder for real mTLS client certs
 * (a certificate + private key would live here instead, which is the
 * standard way this class of secret is normally handled at rest).
 */
export interface AgentLocalState {
  agentId: string;
  credentialSecret: string;
}

export function loadState(path: string): AgentLocalState | null {
  try {
    const raw = fs.readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentLocalState>;
    if (typeof parsed.agentId === "string" && typeof parsed.credentialSecret === "string") {
      return { agentId: parsed.agentId, credentialSecret: parsed.credentialSecret };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveState(path: string, state: AgentLocalState): void {
  fs.writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.chmodSync(path, 0o600);
}
