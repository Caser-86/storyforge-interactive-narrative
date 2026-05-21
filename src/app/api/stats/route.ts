import { NextResponse } from "next/server";
import { getLlmStats, getAssetStats } from "@/lib/observability";
import { query, initDb, getStorageDriver } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyAdminToken } from "@/lib/crypto";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

function hoursAgoSql(hours: number): string {
  const driver = getStorageDriver();
  if (driver === "postgres") {
    return `NOW() - INTERVAL '${hours} hours'`;
  }
  return `datetime('now', '-${hours} hours')`;
}

function daysAgoSql(days: number): string {
  const driver = getStorageDriver();
  if (driver === "postgres") {
    return `NOW() - INTERVAL '${days} days'`;
  }
  return `datetime('now', '-${days} days')`;
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    if (!verifyAdminToken(request.headers.get("authorization"))) {
      return apiError(ErrorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
  }

  let dbStats = null;
  try {
    await ensureDb();

    const driver = getStorageDriver();

    if (driver === "postgres") {
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
          FROM llm_logs WHERE timestamp > ${hoursAgoSql(24)}
        `),
        query(`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE success) AS success_count,
                 AVG(latency_ms)::int AS avg_latency,
                 SUM(input_tokens + output_tokens)::int AS total_tokens
          FROM llm_logs WHERE timestamp > ${daysAgoSql(7)}
        `),
        query(`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE status = 'completed') AS success_count,
                 COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
          FROM asset_jobs WHERE created_at > ${hoursAgoSql(24)}
        `),
        query(`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE status = 'completed') AS success_count,
                 COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
          FROM asset_jobs WHERE created_at > ${daysAgoSql(7)}
        `),
        query(`
          SELECT COUNT(*)::int AS total FROM game_sessions WHERE created_at > ${hoursAgoSql(24)}
        `),
        query(`
          SELECT COUNT(*)::int AS total FROM game_sessions WHERE created_at > ${daysAgoSql(7)}
        `),
        query(`
          SELECT genre, COUNT(*)::int AS cnt FROM game_sessions GROUP BY genre ORDER BY cnt DESC LIMIT 5
        `),
        query(`
          SELECT provider, COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE success) AS success_count,
                 AVG(latency_ms)::int AS avg_latency
          FROM asset_logs WHERE timestamp > ${hoursAgoSql(24)}
          GROUP BY provider ORDER BY total DESC
        `),
        query(`
          SELECT
            COUNT(*) FILTER (WHERE provider = 'cache') AS cache_hits,
            COUNT(*)::int AS total
          FROM asset_logs WHERE timestamp > ${hoursAgoSql(24)}
        `),
      ]);

      dbStats = {
        last24h: {
          llm: llm24h.rows[0],
          assets: asset24h.rows[0],
          newSessions: Number(sessions24h.rows[0].total),
          topGenres: topGenres.rows,
          providers: providerStats.rows,
          cacheHitRate: cacheHitRate.rows[0]
            ? `${((cacheHitRate.rows[0].cache_hits / Math.max(Number(cacheHitRate.rows[0].total), 1)) * 100).toFixed(1)}%`
            : "0%",
        },
        last7d: {
          llm: llm7d.rows[0],
          assets: asset7d.rows[0],
          newSessions: Number(sessions7d.rows[0].total),
        },
      };
    } else {
      const [llm24h, llm7d, asset24h, asset7d, sessions24h, sessions7d, topGenres, providerStats, cacheHitRate] = await Promise.all([
        query(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN success THEN 1 ELSE 0 END) AS success_count,
                 AVG(latency_ms) AS avg_latency,
                 0 AS p50_latency,
                 0 AS p95_latency,
                 SUM(input_tokens + output_tokens) AS total_tokens,
                 SUM(input_tokens) AS input_tokens,
                 SUM(output_tokens) AS output_tokens,
                 SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failure_count,
                 AVG(retry_count) AS avg_retries
          FROM llm_logs WHERE timestamp > ${hoursAgoSql(24)}
        `),
        query(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN success THEN 1 ELSE 0 END) AS success_count,
                 AVG(latency_ms) AS avg_latency,
                 SUM(input_tokens + output_tokens) AS total_tokens
          FROM llm_logs WHERE timestamp > ${daysAgoSql(7)}
        `),
        query(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success_count,
                 SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
          FROM asset_jobs WHERE created_at > ${hoursAgoSql(24)}
        `),
        query(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success_count,
                 SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
          FROM asset_jobs WHERE created_at > ${daysAgoSql(7)}
        `),
        query(`
          SELECT COUNT(*) AS total FROM game_sessions WHERE created_at > ${hoursAgoSql(24)}
        `),
        query(`
          SELECT COUNT(*) AS total FROM game_sessions WHERE created_at > ${daysAgoSql(7)}
        `),
        query(`
          SELECT genre, COUNT(*) AS cnt FROM game_sessions GROUP BY genre ORDER BY cnt DESC LIMIT 5
        `),
        query(`
          SELECT provider, COUNT(*) AS total,
                 SUM(CASE WHEN success THEN 1 ELSE 0 END) AS success_count,
                 AVG(latency_ms) AS avg_latency
          FROM asset_logs WHERE timestamp > ${hoursAgoSql(24)}
          GROUP BY provider ORDER BY total DESC
        `),
        query(`
          SELECT
            SUM(CASE WHEN provider = 'cache' THEN 1 ELSE 0 END) AS cache_hits,
            COUNT(*) AS total
          FROM asset_logs WHERE timestamp > ${hoursAgoSql(24)}
        `),
      ]);

      dbStats = {
        last24h: {
          llm: llm24h.rows[0],
          assets: asset24h.rows[0],
          newSessions: Number(sessions24h.rows[0].total),
          topGenres: topGenres.rows,
          providers: providerStats.rows,
          cacheHitRate: cacheHitRate.rows[0]
            ? `${((Number(cacheHitRate.rows[0].cache_hits) / Math.max(Number(cacheHitRate.rows[0].total), 1)) * 100).toFixed(1)}%`
            : "0%",
        },
        last7d: {
          llm: llm7d.rows[0],
          assets: asset7d.rows[0],
          newSessions: Number(sessions7d.rows[0].total),
        },
      };
    }
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
