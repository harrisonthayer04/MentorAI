"use client";

import { SessionProvider } from "next-auth/react";
import AccentColorLoader from "./components/AccentColorLoader";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AccentColorLoader />
      {children}
    </SessionProvider>
  );
}
