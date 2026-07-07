import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { db } from "@/lib/db";
import { AlertStatus } from "@/app/generated/prisma/client";

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && Object.values(AlertStatus).includes(statusParam as AlertStatus)
      ? (statusParam as AlertStatus)
      : undefined;

  const alerts = await db.alert.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ alerts });
}
