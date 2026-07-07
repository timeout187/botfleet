import { db } from "@/lib/db";
import { generateRandomToken, hashToken } from "@/lib/agents/token-hash";
import { AgentCredentialStatus } from "@/app/generated/prisma/client";

/**
 * NOT mutual TLS. This is a disclosed, development-grade placeholder: a
 * random bearer secret, handed to the agent exactly once at enrollment
 * time (see lib/agent-gateway/server.ts's `agent.accepted` reply), and
 * verified on every subsequent connection by looking up its SHA-256
 * fingerprint - the plaintext secret itself is never stored.
 *
 * Production hardening (see docs/security.md) means replacing this with
 * real mTLS client certificates issued by a CA the control plane
 * controls. This interface exists specifically so that swap is a new
 * provider implementation, not a rewrite of every call site - see the
 * mission's Phase 4 note on why a "secure provider interface" is the
 * right shape for an honest first pass here.
 */
export interface AgentCredentialProvider {
  issue(agentId: string): Promise<{ secret: string; fingerprint: string }>;
  verify(agentId: string, presentedSecret: string): Promise<boolean>;
  revoke(agentId: string): Promise<void>;
}

class DevelopmentBearerCredentialProvider implements AgentCredentialProvider {
  async issue(agentId: string): Promise<{ secret: string; fingerprint: string }> {
    const secret = generateRandomToken();
    const fingerprint = hashToken(secret);
    await db.agentCredential.create({ data: { agentId, fingerprint } });
    return { secret, fingerprint };
  }

  async verify(agentId: string, presentedSecret: string): Promise<boolean> {
    const fingerprint = hashToken(presentedSecret);
    const credential = await db.agentCredential.findUnique({ where: { fingerprint } });
    if (!credential) return false;
    if (credential.agentId !== agentId) return false;
    if (credential.status !== AgentCredentialStatus.active) return false;
    if (credential.expiresAt && credential.expiresAt.getTime() < Date.now()) return false;
    return true;
  }

  async revoke(agentId: string): Promise<void> {
    await db.agentCredential.updateMany({
      where: { agentId, status: AgentCredentialStatus.active },
      data: { status: AgentCredentialStatus.revoked, revokedAt: new Date() },
    });
  }
}

export const agentCredentialProvider: AgentCredentialProvider =
  new DevelopmentBearerCredentialProvider();
