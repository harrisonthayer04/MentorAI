"use client";

import { signIn } from "next-auth/react";

export default function SignInButton({ className }: { className?: string }) {
  const handleClick = () => signIn("google", { callbackUrl: "/dashboard" });

  return (
    <button onClick={handleClick} className={className}>
      Continue with Google
    </button>
  );
}


