import { NextResponse } from "next/server";
import { getAuthoringDbPath, initializeAuthoringDatabase } from "@/lib/authoring/database";
import { getErrorMessage } from "@/lib/errors";

export async function GET(): Promise<Response> {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string; details?: unknown }> = {};
  const dbStart = Date.now();
  let database;

  try {
    database = initializeAuthoringDatabase();
    const integrity = database.pragma("integrity_check", { simple: true });
    checks.authoring = {
      status: integrity === "ok" ? "ok" : "error",
      latencyMs: Date.now() - dbStart,
      details: { driver: "sqlite", persistent: true },
    };
    if (integrity !== "ok") checks.authoring.error = "SQLite integrity check failed";
  } catch (error) {
    checks.authoring = { status: "error", error: getErrorMessage(error, "Authoring database unavailable") };
  } finally {
    database?.close();
  }

  const mockLlm = process.env.MOCK_LLM === "true";
  const llmConfigured = Boolean(process.env.OPENAI_API_KEY);
  checks.llm = {
    status: mockLlm ? "mock" : llmConfigured ? "configured" : "not_configured",
    details: {
      active: !mockLlm && llmConfigured,
      mode: mockLlm ? "mock" : llmConfigured ? "real" : "not_configured",
      model: process.env.OPENAI_MODEL || "default",
      baseUrl: process.env.OPENAI_BASE_URL || "default",
    },
  };

  const healthy = checks.authoring.status === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "error",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      storage: {
        driver: "sqlite",
        persistent: true,
        path: getAuthoringDbPath(),
      },
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
