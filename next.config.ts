import type { NextConfig } from "next";
import { assertSafeBindHost } from "./src/lib/authoring/local-security";

assertSafeBindHost(process.env.STORYFORGE_HOST ?? "127.0.0.1", process.env.STORYFORGE_ALLOW_LAN === "true");

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["geist"],
};

export default nextConfig;
