import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "../components/SignInButton";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-bg-start)] via-[var(--color-bg-mid)] to-[var(--color-bg-end)] dark:bg-gradient-to-br dark:from-[var(--color-bg-start)] dark:via-[var(--color-bg-mid)] dark:to-[var(--color-bg-end)] p-6 [animation:fade-in_0.3s_ease-out_both]">
      <div className="w-full max-w-md rounded-2xl bg-white/70 dark:bg-black/20 backdrop-blur p-8 border border-gray-200/50 dark:border-gray-700/30 shadow-xl [animation:fade-in-up_0.4s_ease-out_both]">
        <h1 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-6 text-center">Sign in</h1>

        <SignInButton className="w-full rounded-xl bg-[var(--color-brand)] hover:bg-[color-mix(in_oklab,var(--color-brand),black_12%)] text-white font-display font-semibold py-3 transition-colors" />
      </div>
    </div>
  );
}


