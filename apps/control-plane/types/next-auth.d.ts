import type { DefaultSession } from "next-auth";
import type { Role } from "@/app/generated/prisma/client";

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      role: Role;
      discordUserId?: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: Role;
    discordUserId: string | null;
  }
}
