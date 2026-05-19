import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { enqueueAssetJob } from "@/lib/asset-queue";
import { verifyStreamToken } from "@/lib/crypto";
import { apiError, ErrorCodes } from "@/lib/api-errors";
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
    const url = new URL(request.url);
    const streamToken = url.searchParams.get("streamToken");

    if (!streamToken) {
      return apiError(ErrorCodes.FORBIDDEN, "streamToken query parameter required", 403);
    }

    const verification = verifyStreamToken(streamToken, sessionId);
    if (!verification.valid) {
      return apiError(ErrorCodes.FORBIDDEN, verification.reason || "Invalid stream token", 403);
    }

    const encoder = new TextEncoder();
    let closed = false;
    const notifiedIds = new Set<string>();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            closed = true;
          }
        };

        const queuedJobs = await query(
          `SELECT id, status, prompt_json, provider, session_id, scene_id FROM asset_jobs WHERE session_id = $1 AND status = 'queued'`,
          [sessionId]
        );

        for (const job of queuedJobs.rows) {
          try {
            await enqueueAssetJob({
              assetJobId: job.id,
              sessionId: job.session_id,
              sceneId: job.scene_id,
              promptJson: typeof job.prompt_json === "string"
                ? JSON.parse(job.prompt_json) as ArtPrompt
                : job.prompt_json as ArtPrompt,
              provider: job.provider,
            });
          } catch (queueErr) {
            console.warn("Failed to enqueue asset job:", queueErr instanceof Error ? queueErr.message : queueErr);
          }
        }

        const pollStatus = async () => {
          const res = await query(
            `SELECT id, status, url, type, provider, error FROM asset_jobs WHERE session_id = $1 AND status IN ('completed', 'failed', 'generating')`,
            [sessionId]
          );

          for (const job of res.rows) {
            if (notifiedIds.has(job.id)) continue;

            if (job.status === "generating") {
              notifiedIds.add(job.id);
              sendEvent("asset.updated", {
                assetJobId: job.id,
                status: "generating",
              });
              continue;
            }

            notifiedIds.add(job.id);

            if (job.status === "completed") {
              sendEvent("asset.completed", {
                assetJobId: job.id,
                url: job.url,
                provider: job.provider,
              });
            } else if (job.status === "failed") {
              sendEvent("asset.failed", {
                assetJobId: job.id,
                fallback: "css_scene_card",
                error: job.error,
              });
            }
          }
        };

        await pollStatus();

        let pollCount = 0;
        const interval = setInterval(async () => {
          if (closed) {
            clearInterval(interval);
            return;
          }

          pollCount++;
          if (pollCount > 60) {
            clearInterval(interval);
            try { controller.close(); } catch {}
            return;
          }

          const remaining = await query(
            `SELECT COUNT(*) as cnt FROM asset_jobs WHERE session_id = $1 AND status IN ('queued', 'generating')`,
            [sessionId]
          );

          if (Number(remaining.rows[0]?.cnt) === 0) {
            clearInterval(interval);
            try { controller.close(); } catch {}
            return;
          }

          await pollStatus();
        }, 2000);

        request.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(interval);
          try { controller.close(); } catch {}
        });
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
      { code: "INTERNAL", message: error instanceof Error ? error.message : "Internal server error", traceId: "events" },
      { status: 500 }
    );
  }
}
