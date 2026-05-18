import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getQueueHealth, isQueueAvailable } from "@/lib/asset-queue";
import { getDailyCost, isCircuitOpen } from "@/lib/observability-persist";

type HealthStatus = "ok" | "degraded" | "error";

function computeOverallStatus(checks: Record<string, { status: string }>): HealthStatus {
  const dbOk = checks.database?.status === "ok";
  const redisOk = checks.redis?.status === "ok";
  const imageProvider = process.env.IMAGE_PROVIDER || "mock";

  if (Object.values(checks).some((check) => check.status === "error")) return "error";
  if (!dbOk) return "error";

  if (!redisOk && imageProvider !== "mock") return "error";
  if (!redisOk && imageProvider === "mock") return "degraded";

  return "ok";
}

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

  checks.llm = {
    status: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
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
    details: dailyCost,
  };

  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_TOKEN) {
    checks.adminToken = {
      status: "warning",
      error: "ADMIN_TOKEN not set - /api/stats is unprotected in production",
    };
  }

  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.TOKEN_SALT ||
      process.env.TOKEN_SALT === "change-this-in-production" ||
      process.env.TOKEN_SALT === "change-this-to-a-random-string-in-production")
  ) {
    checks.tokenSalt = {
      status: "error",
      error: "TOKEN_SALT must be configured to a random production secret",
    };
  }

  const overallStatus = computeOverallStatus(checks);
  const httpStatus = overallStatus === "error" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: httpStatus }
  );
}
