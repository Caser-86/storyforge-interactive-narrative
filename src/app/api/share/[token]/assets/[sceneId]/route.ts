import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { hashToken } from "@/lib/crypto";
import { getErrorMessage } from "@/lib/errors";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; sceneId: string }> }
) {
  try {
    await ensureDb();
    const { token, sceneId } = await params;
    const tokenHash = await hashToken(token);

    const sessionRes = await query(
      `SELECT id, share_token, rating, share_expires_at FROM game_sessions WHERE share_token = $1 AND status != 'deleted'`,
      [tokenHash]
    );

    if (sessionRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Share not found or expired", 404);
    }

    const session = sessionRes.rows[0];

    if (session.share_expires_at && new Date(session.share_expires_at as string) < new Date()) {
      return apiError(ErrorCodes.NOT_FOUND, "Share link has expired", 410);
    }

    if (session.rating === "R") {
      return apiError(ErrorCodes.FORBIDDEN, "R-rated content cannot be shared", 403);
    }

    const assetRes = await query(
      `SELECT aj.id, aj.status, aj.url, aj.type, aj.provider
       FROM asset_jobs aj
       WHERE aj.session_id = $1 AND aj.scene_id = $2 AND aj.status = 'completed'`,
      [session.id, sceneId]
    );

    const assets = assetRes.rows.map((a) => ({
      id: String(a.id),
      status: String(a.status),
      url: String(a.url),
      type: String(a.type),
      provider: String(a.provider),
    }));

    return NextResponse.json({ assets });
  } catch (error) {
    return apiError(ErrorCodes.INTERNAL, getErrorMessage(error, "Internal server error"), 500);
  }
}
