import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Role } from "@/app/generated/prisma/client";
import type { Session } from "next-auth";

type AdminGuardResult = { ok: true; session: Session } | { ok: false; response: NextResponse };

/**
 * Server-side guard for /api/admin/* route handlers. Always returns a JSON
 * 401/403 response - never a redirect - per the API design requirement that
 * fetch requests are never bounced to a login page.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== Role.admin && session.user.role !== Role.owner) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** Stricter than requireAdmin(): only "owner" may change other users' roles. */
export async function requireOwner(): Promise<AdminGuardResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== Role.owner) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}

export async function requireSession(): Promise<AdminGuardResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, session };
}
