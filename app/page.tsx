import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Role } from "@/app/generated/prisma/client";

export default async function Home() {
  let ownerCount = 0;
  let dbOk = true;
  try {
    ownerCount = await db.user.count({ where: { role: Role.owner } });
  } catch {
    dbOk = false;
  }

  if (!dbOk || ownerCount === 0) {
    redirect("/setup");
  }

  const session = await auth();
  redirect(session?.user ? "/admin" : "/login");
}
