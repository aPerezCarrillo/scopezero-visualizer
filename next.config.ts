import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    eslint: {
    ignoreDuringBuilds: true, // <-- allow build to succeed even if ESLint errors exist
  },
};

export default nextConfig;
