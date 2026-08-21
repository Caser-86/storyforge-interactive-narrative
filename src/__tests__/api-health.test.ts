import { afterEach, describe, expect, it, vi } from "vitest";
import { computeOverallStatus } from "@/lib/health-status";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("health status", () => {
  const originalDisableRedis = process.env.DISABLE_REDIS;
  const originalImageFlag = process.env.ENABLE_IMAGE_GENERATION;
  const originalRedisUrl = process.env.REDIS_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalImageProvider = process.env.IMAGE_PROVIDER;
  const originalAdminToken = process.env.ADMIN_TOKEN;
  const originalTokenSalt = process.env.TOKEN_SALT;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    restoreEnv("DISABLE_REDIS", originalDisableRedis);
    restoreEnv("ENABLE_IMAGE_GENERATION", originalImageFlag);
    restoreEnv("REDIS_URL", originalRedisUrl);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("IMAGE_PROVIDER", originalImageProvider);
    restoreEnv("ADMIN_TOKEN", originalAdminToken);
    restoreEnv("TOKEN_SALT", originalTokenSalt);
    restoreEnv("OPENAI_API_KEY", originalOpenAiApiKey);
    vi.resetModules();
  });

  it("stays ok when Redis is disabled and image generation is disabled", () => {
    process.env.ENABLE_IMAGE_GENERATION = "false";
    process.env.IMAGE_PROVIDER = "mock";

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
    process.env.IMAGE_PROVIDER = "mock";

    const status = computeOverallStatus({
      database: { status: "ok" },
      redis: { status: "disabled" },
      llm: { status: "configured" },
      imageProvider: { status: "mock" },
      budget: { status: "ok" },
    });

    expect(status).toBe("degraded");
  });

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
