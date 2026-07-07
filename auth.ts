import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { Role } from "@/app/generated/prisma/client";

function adminDiscordIds(): string[] {
  return (process.env.BOTFLEET_ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [Discord],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      // Lazily backfill BotFleet-specific fields the adapter doesn't set:
      // discordUserId (from the linked Discord account) and a one-time
      // promotion to "owner" for allowlisted Discord IDs on first sign-in.
      let discordUserId = user.discordUserId ?? undefined;
      let role = user.role;

      if (!discordUserId || (role === Role.member && adminDiscordIds().length > 0)) {
        const account = await db.account.findFirst({
          where: { userId: user.id, provider: "discord" },
        });
        const discordId = account?.providerAccountId;
        const shouldPromote =
          discordId && role === Role.member && adminDiscordIds().includes(discordId);
        if (discordId && (!discordUserId || shouldPromote)) {
          const updated = await db.user.update({
            where: { id: user.id },
            data: {
              discordUserId: discordUserId ?? discordId,
              ...(shouldPromote ? { role: Role.owner } : {}),
            },
          });
          discordUserId = updated.discordUserId ?? undefined;
          role = updated.role;
        }
      }

      if (session.user) {
        session.user.id = user.id;
        session.user.role = role;
        if (discordUserId) {
          session.user.discordUserId = discordUserId;
        }
      }
      return session;
    },
  },
});
