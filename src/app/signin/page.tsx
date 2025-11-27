import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import SignInButton from "../components/SignInButton";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Subtle gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[80px]" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div 
          className="w-full max-w-sm"
          style={{ animation: "fade-in-up 0.4s ease-out" }}
        >
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-xl font-display font-bold text-zinc-100">MentorAI</span>
            </div>
          </div>

          {/* Card */}
          <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-8">
            <h1 className="text-2xl font-display font-bold text-zinc-100 text-center mb-2">
              Welcome back
            </h1>
            <p className="text-sm text-zinc-500 text-center mb-8">
              Sign in to continue your learning journey
            </p>

            <SignInButton className="w-full flex items-center justify-center gap-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium py-3.5 transition-colors border border-zinc-700" />

            <p className="mt-6 text-xs text-center text-zinc-600">
              By signing in, you agree to our{" "}
              <a href="#" className="text-zinc-400 hover:text-zinc-300 underline">Terms</a>
              {" "}and{" "}
              <a href="#" className="text-zinc-400 hover:text-zinc-300 underline">Privacy Policy</a>
            </p>
          </div>

          {/* Back link */}
          <div className="mt-6 text-center">
            <Link 
              href="/" 
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
