import { Worker } from "bullmq";
import { generateImage, computePromptHash, type GenerateImageInput } from "../lib/asset-service";
import { query, initDb } from "../lib/db";
import { logAssetCall } from "../lib/observability";
import { getConnection, type AssetJobData } from "../lib/asset-queue";
import { isObjectStorageConfigured, downloadAndStore, buildAssetKey } from "../lib/object-storage";
import { readIntEnv } from "../lib/env";
import { getErrorMessage } from "../lib/errors";

const ASSET_TIMEOUT_MS = readIntEnv("ASSET_TIMEOUT_MS", 300000, { min: 1 });
const STALE_CHECK_INTERVAL_MS = readIntEnv("STALE_CHECK_INTERVAL_MS", 60000, { min: 1 });
const ASSET_JOB_ATTEMPTS = readIntEnv("ASSET_JOB_ATTEMPTS", 3, { min: 1 });
const ASSET_JOB_BACKOFF_MS = readIntEnv("ASSET_JOB_BACKOFF_MS", 5000, { min: 0 });

let worker: Worker<AssetJobData> | null = null;

async function markStaleJobs() {
  try {
    const res = await query(
      `UPDATE asset_jobs SET status = 'failed', error = 'Job timed out after ${ASSET_TIMEOUT_MS / 1000}s'
       WHERE status IN ('queued', 'generating')
       AND created_at < NOW() - INTERVAL '${ASSET_TIMEOUT_MS / 1000} seconds'
       RETURNING id, session_id`
    );
    if (res.rows.length > 0) {
      console.log(`[Worker] Marked ${res.rows.length} stale jobs as failed`);
    }
  } catch (err) {
    console.warn("[Worker] Failed to mark stale jobs:", getErrorMessage(err));
  }
}

async function writeAssetVersion(assetJobId: string, url: string | null, promptJson: Record<string, unknown>, provider: string, promptHash: string) {
  try {
    const versionRes = await query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM asset_versions WHERE asset_job_id = $1`,
      [assetJobId]
    );
    const nextVer = versionRes.rows[0]?.next_ver || 1;
    const versionId = `ver_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    await query(
      `INSERT INTO asset_versions (id, asset_job_id, url, prompt_hash, prompt_json, provider, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [versionId, assetJobId, url, promptHash, JSON.stringify(promptJson), provider, nextVer]
    );
  } catch (err) {
    console.warn(`[Worker] Failed to write asset_version for ${assetJobId}:`, getErrorMessage(err));
  }
}

function startWorker() {
  const connection = getConnection();

  worker = new Worker<AssetJobData>(
    "asset-generation",
    async (job) => {
      const { assetJobId, sessionId, sceneId, promptJson, provider, quality, bypassCache } = job.data;
      const start = Date.now();

      try {
        const lockRes = await query(
          `UPDATE asset_jobs SET status = 'generating' WHERE id = $1 AND status = 'queued' RETURNING id`,
          [assetJobId]
        );

        if (lockRes.rows.length === 0) {
          return { status: "skipped", reason: "already_processing" };
        }

        if (!bypassCache) {
          const currentHash = computePromptHash(promptJson);
          const cachedRes = await query(
            `SELECT url FROM asset_jobs WHERE prompt_hash = $1 AND status = 'completed' AND url IS NOT NULL LIMIT 1`,
            [currentHash]
          );

          if (cachedRes.rows.length > 0) {
            await query(
          `UPDATE asset_jobs SET status = 'completed', url = $1, completed_at = NOW() WHERE id = $2`,
          [cachedRes.rows[0].url as string | null, assetJobId]
        );

        await writeAssetVersion(assetJobId, cachedRes.rows[0].url as string | null, promptJson, "cache", currentHash);

            logAssetCall({
              assetJobId,
              sessionId,
              sceneId,
              provider: "cache",
              type: "image",
              latencyMs: Date.now() - start,
              success: true,
              timestamp: new Date().toISOString(),
            });

            return { status: "completed", url: cachedRes.rows[0].url, cached: true };
          }
        }

        const input: GenerateImageInput = {
          prompt: promptJson.prompt,
          negativePrompt: promptJson.negativePrompt,
          aspectRatio: promptJson.aspectRatio,
          seed: promptJson.seedHint,
          styleLock: promptJson.styleLock,
          quality: quality || "draft",
        };

        const result = await generateImage(input);

        let finalUrl = result.imageUrl || null;
        if (finalUrl && isObjectStorageConfigured()) {
          try {
            const storageKey = buildAssetKey(sessionId, sceneId);
            finalUrl = await downloadAndStore(finalUrl, storageKey);
          } catch (storageErr) {
            console.warn(`[Worker] Object storage upload failed, keeping remote URL:`, getErrorMessage(storageErr));
          }
        }

        await query(
          `UPDATE asset_jobs SET status = 'completed', url = $1, completed_at = NOW() WHERE id = $2`,
          [finalUrl, assetJobId]
        );

        await writeAssetVersion(assetJobId, finalUrl, promptJson, result.provider, computePromptHash(promptJson));

        logAssetCall({
          assetJobId,
          sessionId,
          sceneId,
          provider: result.provider,
          type: "image",
          latencyMs: Date.now() - start,
          success: true,
          timestamp: new Date().toISOString(),
        });

        return { status: "completed", url: result.imageUrl };
      } catch (error) {
        await query(
          `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
          [getErrorMessage(error), assetJobId]
        );

        logAssetCall({
          assetJobId,
          sessionId,
          sceneId,
          provider,
          type: "image",
          latencyMs: Date.now() - start,
          success: false,
          error: getErrorMessage(error),
          timestamp: new Date().toISOString(),
        });

        throw error;
      }
    },
    {
      connection,
      concurrency: readIntEnv("ASSET_WORKER_CONCURRENCY", 3, { min: 1 }),
      lockDuration: ASSET_TIMEOUT_MS,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed:`, job.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });
}

async function gracefulShutdown(signal: string) {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
  if (worker) {
    await worker.close();
  }
  const connection = getConnection();
  await connection.quit();
  process.exit(0);
}

async function main() {
  console.log("Initializing database...");
  await initDb();

  const dbCheck = await query("SELECT 1 AS ok");
  if (!dbCheck.rows?.[0]?.ok) {
    console.error("[Worker] Database connection check failed");
    process.exit(1);
  }
  console.log("[Worker] Database connection OK");

  try {
    const connection = getConnection();
    const pingRes = await connection.ping();
    if (pingRes !== "PONG") {
      console.warn("[Worker] Redis ping returned:", pingRes);
    } else {
      console.log("[Worker] Redis connection OK");
    }
  } catch (err) {
    console.warn("[Worker] Redis connection check failed:", getErrorMessage(err));
  }

  startWorker();
  console.log("Asset worker started. Waiting for jobs...");

  const staleTimer = setInterval(markStaleJobs, STALE_CHECK_INTERVAL_MS);
  markStaleJobs();

  process.on("SIGINT", () => {
    clearInterval(staleTimer);
    gracefulShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    clearInterval(staleTimer);
    gracefulShutdown("SIGTERM");
  });
}

main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});

export { AssetJobData, ASSET_JOB_ATTEMPTS, ASSET_JOB_BACKOFF_MS };
