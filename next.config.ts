// Enable NextAuth's experimental URL-based config if needed later
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  // Avoid iCloud/Dropbox syncing the build dir, which can cause ENOENT in dev
  distDir: ".next.nosync",
};

export default nextConfig;
