import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { query, initDb } from "@/lib/db";
import { computePromptHash } from "@/lib/asset-service";
import { enqueueAssetJob } from "@/lib/asset-queue";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyToken } from "@/lib/crypto";
import type { ArtPrompt } from "@/lib/schemas";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetJobId: string }> }
) {
  try {
    await ensureDb();

    const { assetJobId } = await params;

    const res = await query(
      `SELECT aj.id, aj.type, aj.provider, aj.status, aj.url, aj.error, aj.prompt_hash, gs.owner_token FROM asset_jobs aj JOIN game_sessions gs ON aj.session_id = gs.id WHERE aj.id = $1`,
      [assetJobId]
    );

    if (res.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Asset job not found", 404);
    }

    const job = res.rows[0];

    const ownerToken = request.headers.get("x-owner-token");
    if (job.owner_token) {
      if (!ownerToken) {
        return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
      }
      const valid = await verifyToken(ownerToken, job.owner_token);
      if (!valid) {
        return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
      }
    }

    const versionsRes = await query(
      `SELECT id, url, prompt_hash, provider, version, created_at FROM asset_versions WHERE asset_job_id = $1 ORDER BY version DESC`,
      [assetJobId]
    );

    const isOwner = ownerToken && job.owner_token
      ? await verifyToken(ownerToken, job.owner_token).catch(() => false)
      : false;

    const versions = isOwner
      ? versionsRes.rows
      : versionsRes.rows.map((v: { id: string; url: string; provider: string; version: number; created_at: string }) => ({
          id: v.id,
          url: v.url,
          provider: v.provider,
          version: v.version,
          created_at: v.created_at,
        }));

    return NextResponse.json({
      id: job.id,
      status: job.status,
      type: job.type,
      url: job.url,
      provider: job.provider,
      error: job.error,
      ...(isOwner ? { prompt_hash: job.prompt_hash } : {}),
      versions,
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetJobId: string }> }
) {
  try {
    await ensureDb();

    const { assetJobId } = await params;

    let quality: "draft" | "standard" | "high" | undefined;
    try {
      const body = await request.json();
      if (body.quality && !["draft", "standard", "high"].includes(body.quality)) {
        return apiError(ErrorCodes.VALIDATION, "quality must be one of: draft, standard, high", 400);
      }
      quality = body.quality;
    } catch {
      // no body or invalid JSON, use default quality
    }

    const res = await query(
      `SELECT aj.id, aj.type, aj.provider, aj.status, aj.url, aj.prompt_json, aj.prompt_hash, aj.session_id, aj.scene_id, gs.owner_token FROM asset_jobs aj JOIN game_sessions gs ON aj.session_id = gs.id WHERE aj.id = $1`,
      [assetJobId]
    );

    if (res.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Asset job not found", 404);
    }

    const job = res.rows[0];

    const ownerToken = request.headers.get("x-owner-token");
    if (job.owner_token) {
      if (!ownerToken) {
        return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
      }
      const valid = await verifyToken(ownerToken, job.owner_token);
      if (!valid) {
        return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
      }
    }

    if (job.url || job.prompt_hash) {
      const versionCountRes = await query(
        `SELECT COUNT(*)::int AS cnt FROM asset_versions WHERE asset_job_id = $1`,
        [assetJobId]
      );
      const nextVersion = (versionCountRes.rows[0]?.cnt || 0) + 1;

      await query(
        `INSERT INTO asset_versions (id, asset_job_id, url, prompt_hash, prompt_json, provider, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          uuidv4(),
          assetJobId,
          job.url,
          job.prompt_hash,
          typeof job.prompt_json === "string" ? job.prompt_json : JSON.stringify(job.prompt_json),
          job.provider,
          nextVersion,
        ]
      );
    }

    const newSeed = Math.floor(Math.random() * 2147483647) + 1;
    const promptJson: ArtPrompt = typeof job.prompt_json === "string"
      ? JSON.parse(job.prompt_json)
      : job.prompt_json;
    promptJson.seedHint = newSeed;

    const newHash = computePromptHash(promptJson);

    await query(
      `UPDATE asset_jobs SET status = 'queued', url = NULL, error = NULL, prompt_json = $1, prompt_hash = $2, completed_at = NULL WHERE id = $3`,
      [JSON.stringify(promptJson), newHash, assetJobId]
    );

    try {
      const enqueueResult = await enqueueAssetJob({
        assetJobId,
        sessionId: job.session_id,
        sceneId: job.scene_id,
        promptJson,
        provider: job.provider,
        quality,
        bypassCache: true,
      });
      if (!enqueueResult.queued) {
        await query(
          `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
          ["Worker unavailable: " + (enqueueResult.reason || "unknown"), assetJobId]
        );
      }
    } catch (queueErr) {
      console.warn("Failed to enqueue asset job:", queueErr instanceof Error ? queueErr.message : queueErr);
      await query(
        `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
        ["Worker unavailable: " + (queueErr instanceof Error ? queueErr.message : String(queueErr)), assetJobId]
      );
    }

    return NextResponse.json({
      id: job.id,
      status: "queued",
      type: job.type,
      message: "Asset regeneration queued",
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
