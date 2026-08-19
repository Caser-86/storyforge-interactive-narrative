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

  it("does not probe Redis when image generation is disabled", async () => {
    process.env.ENABLE_IMAGE_GENERATION = "false";
    process.env.IMAGE_PROVIDER = "mock";
    delete process.env.REDIS_URL;

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.redis.status).toBe("disabled");
  });

  it("reports redisRequired in production when REDIS_URL is whitespace only", async () => {
    restoreEnv("NODE_ENV", "production");
    process.env.ENABLE_IMAGE_GENERATION = "true";
    process.env.REDIS_URL = "   ";
    process.env.IMAGE_PROVIDER = "replicate";
    process.env.ADMIN_TOKEN = "admin-token";
    process.env.TOKEN_SALT = "production-secret";
    process.env.OPENAI_API_KEY = "test-key";

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.redis.status).toBe("disabled");
    expect(body.checks.redisRequired).toEqual({
      status: "error",
      error: "REDIS_URL required when ENABLE_IMAGE_GENERATION=true",
    });
  });
});
