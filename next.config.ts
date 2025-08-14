// Enable NextAuth's experimental URL-based config if needed later
import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  // Use a custom distDir only in local/dev to avoid iCloud/Dropbox sync issues.
  // Vercel expects the default `.next` output.
  ...(isVercel ? {} : { distDir: ".next.nosync" }),
};

export default nextConfig;
