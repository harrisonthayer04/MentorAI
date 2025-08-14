import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardClient from "./DashboardClient";
import ChatWorkspace from "./ChatWorkspace";

export default async function DashboardPage() {
  const _session = await getServerSession(authOptions);

  // Optionally gate access; for now, render regardless.
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-start)] via-[var(--color-bg-mid)] to-[var(--color-bg-end)]">
      <div className="pt-2 md:pt-3">
        <DashboardClient />
      </div>
      <ChatWorkspace />
    </div>
  );
}


