import { NextResponse } from "next/server";
import { getLlmStats, getAssetStats } from "@/lib/observability";
import { query, initDb } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const adminToken = process.env.ADMIN_TOKEN;

    if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
      return apiError(ErrorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
  }

  let dbStats = null;
  try {
    await ensureDb();

    const [llm24h, llm7d, asset24h, asset7d, sessions24h, sessions7d, topGenres, providerStats, cacheHitRate] = await Promise.all([
      query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE success) AS success_count,
               AVG(latency_ms)::int AS avg_latency,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50_latency,
               PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_latency,
               SUM(input_tokens + output_tokens)::int AS total_tokens,
               SUM(input_tokens)::int AS input_tokens,
               SUM(output_tokens)::int AS output_tokens,
               COUNT(*) FILTER (WHERE NOT success)::int AS failure_count,
               AVG(retry_count)::numeric(3,2) AS avg_retries
        FROM llm_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE success) AS success_count,
               AVG(latency_ms)::int AS avg_latency,
               SUM(input_tokens + output_tokens)::int AS total_tokens
        FROM llm_logs WHERE timestamp > NOW() - INTERVAL '7 days'
      `),
      query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS success_count,
               COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
        FROM asset_jobs WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS success_count,
               COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
        FROM asset_jobs WHERE created_at > NOW() - INTERVAL '7 days'
      `),
      query(`
        SELECT COUNT(*)::int AS total FROM game_sessions WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*)::int AS total FROM game_sessions WHERE created_at > NOW() - INTERVAL '7 days'
      `),
      query(`
        SELECT genre, COUNT(*)::int AS cnt FROM game_sessions GROUP BY genre ORDER BY cnt DESC LIMIT 5
      `),
      query(`
        SELECT provider, COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE success) AS success_count,
               AVG(latency_ms)::int AS avg_latency
        FROM asset_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
        GROUP BY provider ORDER BY total DESC
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE provider = 'cache') AS cache_hits,
          COUNT(*)::int AS total
        FROM asset_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
      `),
    ]);

    dbStats = {
      last24h: {
        llm: llm24h.rows[0],
        assets: asset24h.rows[0],
        newSessions: sessions24h.rows[0].total,
        topGenres: topGenres.rows,
        providers: providerStats.rows,
        cacheHitRate: cacheHitRate.rows[0]
          ? `${((cacheHitRate.rows[0].cache_hits / Math.max(cacheHitRate.rows[0].total, 1)) * 100).toFixed(1)}%`
          : "0%",
      },
      last7d: {
        llm: llm7d.rows[0],
        assets: asset7d.rows[0],
        newSessions: sessions7d.rows[0].total,
      },
    };
  } catch {
    dbStats = { error: "Database stats unavailable" };
  }

  return NextResponse.json({
    llm: getLlmStats(),
    assets: getAssetStats(),
    db: dbStats,
    timestamp: new Date().toISOString(),
  });
}
