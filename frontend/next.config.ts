import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: join(currentDir, ".."),
  reactStrictMode: true,
  eslint: {
    // We disable these rules in eslint.config.mjs already; skip the lint pass
    // during `next build` so production deploys aren't blocked by stylistic
    // warnings from eslint-plugin-react-hooks v6.
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
