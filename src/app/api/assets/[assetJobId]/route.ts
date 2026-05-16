import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { generateImage, computePromptHash } from "@/lib/asset-service";
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
      `SELECT id, type, provider, status, url, error, prompt_json, prompt_hash FROM asset_jobs WHERE id = $1`,
      [assetJobId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Asset job not found" }, { status: 404 });
    }

    const job = res.rows[0];

    if (job.status === "queued" || job.status === "generating") {
      try {
        await query(
          `UPDATE asset_jobs SET status = 'generating' WHERE id = $1 AND status = 'queued'`,
          [assetJobId]
        );

        const promptJson: ArtPrompt = typeof job.prompt_json === "string"
          ? JSON.parse(job.prompt_json)
          : job.prompt_json;

        const result = await generateImage({
          prompt: promptJson.prompt,
          negativePrompt: promptJson.negativePrompt,
          aspectRatio: promptJson.aspectRatio,
          seed: promptJson.seedHint,
          styleLock: promptJson.styleLock,
          quality: "draft",
        });

        await query(
          `UPDATE asset_jobs SET status = 'completed', url = $1, completed_at = NOW() WHERE id = $2`,
          [result.imageUrl || null, assetJobId]
        );

        return NextResponse.json({
          id: job.id,
          status: "completed",
          type: job.type,
          url: result.imageUrl,
          provider: result.provider,
          error: null,
        });
      } catch (genError) {
        await query(
          `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
          [genError instanceof Error ? genError.message : "Generation failed", assetJobId]
        );

        return NextResponse.json({
          id: job.id,
          status: "failed",
          type: job.type,
          url: null,
          provider: job.provider,
          error: genError instanceof Error ? genError.message : "Generation failed",
        });
      }
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      type: job.type,
      url: job.url,
      provider: job.provider,
      error: job.error,
    });
  } catch (error) {
    console.error("GET /api/assets/[assetJobId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
