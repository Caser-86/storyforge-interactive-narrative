import { afterEach, describe, expect, it, vi } from "vitest";
import { computeOverallStatus } from "@/lib/health-status";

describe("health status", () => {
  const originalImageFlag = process.env.ENABLE_IMAGE_GENERATION;
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    process.env.ENABLE_IMAGE_GENERATION = originalImageFlag;
    process.env.REDIS_URL = originalRedisUrl;
    delete process.env.DISABLE_REDIS;
    vi.resetModules();
  });

  it("stays ok when Redis is disabled and image generation is disabled", () => {
    process.env.ENABLE_IMAGE_GENERATION = "false";

    const status = computeOverallStatus({
      database: { status: "ok" },
      redis: { status: "disabled" },
      llm: { status: "configured" },
      imageProvider: { status: "mock" },
      budget: { status: "ok" },
    });

    expect(status).toBe("ok");
  });

  it("degrades when Redis is disabled while image generation is enabled with mock provider", () => {
    process.env.ENABLE_IMAGE_GENERATION = "true";

    const status = computeOverallStatus({
      database: { status: "ok" },
      redis: { status: "disabled" },
      llm: { status: "configured" },
      imageProvider: { status: "mock" },
      budget: { status: "ok" },
    });

    expect(status).toBe("degraded");
  });

  it("does not probe Redis when image generation is disabled", async () => {
    process.env.ENABLE_IMAGE_GENERATION = "false";
    delete process.env.REDIS_URL;

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.redis.status).toBe("disabled");
  });
});
