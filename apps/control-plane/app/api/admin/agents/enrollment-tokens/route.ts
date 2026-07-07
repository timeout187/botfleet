import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { createEnrollmentToken } from "@/lib/agents/enrollment";

const createTokenSchema = z.object({
  environment: z.string().max(64).optional(),
  requiredLabels: z.record(z.string(), z.string()).optional(),
  ttlMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .default(30),
});

/**
 * Returns the plaintext enrollment token exactly once, in this response -
 * only its SHA-256 hash is ever persisted (see lib/agents/enrollment.ts).
 * There is no GET-by-id for this resource that could ever return it again.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createTokenSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { environment, requiredLabels, ttlMinutes } = parsed.data;

  const restrictions = environment || requiredLabels ? { environment, requiredLabels } : undefined;

  const token = await createEnrollmentToken(
    guard.session.user.id,
    restrictions,
    ttlMinutes * 60 * 1000,
  );

  return NextResponse.json(
    { token: token.plaintextToken, tokenId: token.id, expiresAt: token.expiresAt },
    { status: 201 },
  );
}
