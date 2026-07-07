import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      discordUserId: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}
