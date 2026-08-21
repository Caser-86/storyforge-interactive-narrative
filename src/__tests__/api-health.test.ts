import { describe, expect, it } from "vitest";

describe("health status", () => {
  it("reports only local authoring dependencies", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.authoring.status).toBe("ok");
    expect(body.checks).not.toHaveProperty("redis");
    expect(body.checks).not.toHaveProperty("imageProvider");
  });
});
