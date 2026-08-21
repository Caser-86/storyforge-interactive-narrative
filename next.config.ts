import type { NextConfig } from "next";
import { assertSafeBindHost } from "./src/lib/authoring/local-security";

assertSafeBindHost(process.env.STORYFORGE_HOST ?? "127.0.0.1", process.env.STORYFORGE_ALLOW_LAN === "true");

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.31.199"],
  transpilePackages: ["geist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
