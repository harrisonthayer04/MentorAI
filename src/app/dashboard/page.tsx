import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  await getServerSession(authOptions);

  // Optionally gate access; for now, render regardless.
  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-[var(--color-bg-start)] via-[var(--color-bg-mid)] to-[var(--color-bg-end)]">
      <DashboardClient />
    </div>
  );
}


