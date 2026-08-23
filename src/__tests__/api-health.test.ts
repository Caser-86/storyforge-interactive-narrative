import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("health status", () => {
  it("reports only local authoring dependencies", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.authoring.status).toBe("ok");
    expect(body.checks).not.toHaveProperty("redis");
    expect(body.checks).not.toHaveProperty("imageProvider");
    expect(body).not.toHaveProperty("storage.path");
    expect(body.checks.llm).toEqual({ status: expect.any(String) });
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
    expect(body.version).toBe(packageJson.version);
  });
});
