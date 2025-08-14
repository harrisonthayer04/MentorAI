"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton({ className }: { className?: string }) {
  const handleClick = () => signOut({ callbackUrl: "/" });

  return (
    <button onClick={handleClick} className={className}>
      Sign out
    </button>
  );
}


