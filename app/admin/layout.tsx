import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Role } from "@/app/generated/prisma/client";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== Role.admin && session.user.role !== Role.owner) {
    redirect("/login?error=not-authorized");
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div className="text-sm text-zinc-400">
            Signed in as <span className="text-zinc-200">{session.user.name ?? "admin"}</span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
