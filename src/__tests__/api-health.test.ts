import { afterEach, describe, expect, it } from "vitest";
import { computeOverallStatus } from "@/lib/health-status";

describe("health status", () => {
  const originalImageFlag = process.env.ENABLE_IMAGE_GENERATION;

  afterEach(() => {
    process.env.ENABLE_IMAGE_GENERATION = originalImageFlag;
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
});
