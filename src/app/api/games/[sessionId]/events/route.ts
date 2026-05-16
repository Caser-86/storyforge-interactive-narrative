import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { generateImage } from "@/lib/asset-service";
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
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDb();

    const { sessionId } = await params;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        const pollAssets = async () => {
          const res = await query(
            `SELECT id, status, url, type, provider, error, prompt_json FROM asset_jobs WHERE session_id = $1 AND status IN ('queued', 'generating')`,
            [sessionId]
          );

          for (const job of res.rows) {
            try {
              await query(
                `UPDATE asset_jobs SET status = 'generating' WHERE id = $1 AND status = 'queued'`,
                [job.id]
              );

              sendEvent("asset.updated", { assetJobId: job.id, status: "generating" });

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
                [result.imageUrl || null, job.id]
              );

              sendEvent("asset.completed", {
                assetJobId: job.id,
                url: result.imageUrl,
                provider: result.provider,
              });
            } catch (genError) {
              await query(
                `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
                [genError instanceof Error ? genError.message : "Generation failed", job.id]
              );

              sendEvent("asset.failed", {
                assetJobId: job.id,
                fallback: "css_scene_card",
                error: genError instanceof Error ? genError.message : "Unknown error",
              });
            }
          }
        };

        await pollAssets();

        let pollCount = 0;
        const interval = setInterval(async () => {
          pollCount++;
          if (pollCount > 30) {
            clearInterval(interval);
            controller.close();
            return;
          }

          const remaining = await query(
            `SELECT COUNT(*) as cnt FROM asset_jobs WHERE session_id = $1 AND status IN ('queued', 'generating')`,
            [sessionId]
          );

          if (Number(remaining.rows[0]?.cnt) === 0) {
            clearInterval(interval);
            controller.close();
            return;
          }

          await pollAssets();
        }, 3000);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("GET /api/games/[sessionId]/events error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
