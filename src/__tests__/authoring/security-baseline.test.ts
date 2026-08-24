import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import proxy, { config as proxyConfig } from "@/proxy";
import nextConfig from "../../../next.config";

describe("production security baseline", () => {
  it("applies baseline headers to authoring pages and APIs", async () => {
    const response = await proxy(new NextRequest("http://local/projects"));

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toBeTruthy();
    const contentSecurityPolicy = response.headers.get("Content-Security-Policy");
    expect(contentSecurityPolicy).toBeTruthy();
    expect(contentSecurityPolicy).toMatch(/frame-ancestors 'none'/);
    expect(response.headers.get("X-XSS-Protection")).toBeNull();
    expect(proxyConfig.matcher).not.toEqual(["/api/:path*"]);
  });

  it("does not trust a fixed private LAN origin or arbitrary remote images", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(expect.arrayContaining(["127.0.0.1", "localhost"]));
    expect(nextConfig.allowedDevOrigins).not.toContain("192.168.31.199");
    expect(nextConfig.images?.remotePatterns).toBeUndefined();
  });

  it("does not prevent users from zooming the authoring UI", () => {
    const layoutSource = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layoutSource).not.toMatch(/maximumScale/);
  });
});
