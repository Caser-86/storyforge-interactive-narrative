import { NextResponse } from "next/server";
import { query, getStorageDriverInfo } from "@/lib/db";
import { getQueueHealth, isQueueAvailable } from "@/lib/asset-queue";
import { getDailyCost, isCircuitOpen, isWithinBudget } from "@/lib/observability-persist";
import { computeOverallStatus } from "@/lib/health-status";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string; details?: unknown }> = {};

  const dbStart = Date.now();
  try {
    await query("SELECT 1");
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (e) {
    checks.database = { status: "error", error: e instanceof Error ? e.message : "Unknown" };
  }

  if (isQueueAvailable()) {
    const redisStart = Date.now();
    try {
      const queueHealth = await getQueueHealth();
      if (queueHealth) {
        checks.redis = { status: "ok", latencyMs: Date.now() - redisStart, details: queueHealth };
      } else {
        checks.redis = { status: "error", error: "Queue unavailable" };
      }
    } catch (e) {
      checks.redis = { status: "error", error: e instanceof Error ? e.message : "Unknown" };
    }
  } else {
    checks.redis = { status: "disabled", error: "Redis not configured (build phase or DISABLE_REDIS=true)" };
  }

  const mockLlm = process.env.MOCK_LLM === "true";
  const llmConfigured = !!process.env.OPENAI_API_KEY;
  checks.llm = {
    status: mockLlm ? "mock" : llmConfigured ? "configured" : "not_configured",
    details: {
      active: !mockLlm && llmConfigured,
      mode: mockLlm ? "mock" : llmConfigured ? "real" : "not_configured",
      model: process.env.OPENAI_MODEL || "default",
      baseUrl: process.env.OPENAI_BASE_URL || "default",
      hint: mockLlm
        ? "MOCK_LLM=true, narrative uses local mock content"
        : llmConfigured
          ? "LLM is active by default"
          : "OPENAI_API_KEY not configured, fallback narrative will be used",
    },
  };

  checks.imageProvider = {
    status: process.env.IMAGE_PROVIDER || "mock",
  };

  const provider = process.env.IMAGE_PROVIDER || "mock";
  if (provider !== "mock") {
    checks.circuitBreaker = {
      status: isCircuitOpen(provider) ? "open" : "closed",
      details: { provider },
    };
  }

  const dailyCost = getDailyCost();
  checks.budget = {
    status: "ok",
    details: process.env.NODE_ENV === "production"
      ? { withinBudget: isWithinBudget() }
      : dailyCost,
  };

  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_TOKEN) {
      checks.adminToken = {
        status: "error",
        error: "ADMIN_TOKEN not set - /api/stats is unprotected in production",
      };
    }

    if (
      !process.env.TOKEN_SALT ||
      process.env.TOKEN_SALT === "change-this-in-production" ||
      process.env.TOKEN_SALT === "change-this-to-a-random-string-in-production"
    ) {
      checks.tokenSalt = {
        status: "error",
        error: "TOKEN_SALT must be configured to a random production secret",
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      checks.openaiApiKey = {
        status: "error",
        error: "OPENAI_API_KEY not set - narrative generation will fail",
      };
    }

    const imageEnabled = process.env.ENABLE_IMAGE_GENERATION === "true";
    if (imageEnabled) {
      if (!process.env.REDIS_URL) {
        checks.redisRequired = {
          status: "error",
          error: "REDIS_URL required when ENABLE_IMAGE_GENERATION=true",
        };
      }
      const imgProvider = process.env.IMAGE_PROVIDER;
      if (!imgProvider || imgProvider === "mock") {
        checks.imageProviderConfig = {
          status: "error",
          error: "IMAGE_PROVIDER must be set to a real provider (not mock) when ENABLE_IMAGE_GENERATION=true",
        };
      }
    }
  }

  const overallStatus = computeOverallStatus(checks);
  const httpStatus = overallStatus === "error" ? 503 : 200;

  const storageInfo = getStorageDriverInfo();

  return NextResponse.json(
    {
      status: overallStatus,
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      storage: {
        driver: storageInfo.driver,
        persistent: storageInfo.persistent,
        path: storageInfo.path,
      },
      checks,
    },
    { status: httpStatus }
  );
}
