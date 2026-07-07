import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">BotFleet</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Open-source control plane for Discord bot fleets.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/admin" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4752c4]"
          >
            Sign in with Discord
          </button>
        </form>
        <p className="mt-6 text-xs text-zinc-500">
          Only Discord accounts listed in <code className="text-zinc-400">BOTFLEET_ADMIN_DISCORD_IDS</code>{" "}
          are granted admin access on first sign-in.
        </p>
      </div>
    </div>
  );
}
