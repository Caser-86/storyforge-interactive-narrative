import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyToken, hashToken } from "@/lib/crypto";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDb();
    const { sessionId } = await params;

    const sessionRes = await query(
      `SELECT id, status, rating, owner_token FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Session not found", 404);
    }

    if (sessionRes.rows[0].owner_token) {
      const ownerToken = request.headers.get("x-owner-token");
      if (!ownerToken) {
        return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
      }
      const valid = await verifyToken(ownerToken, sessionRes.rows[0].owner_token);
      if (!valid) {
        return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
      }
    }

    if (sessionRes.rows[0].rating === "R") {
      return apiError(ErrorCodes.VALIDATION, "R-rated content cannot be publicly shared", 403);
    }

    const shareToken = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
    const shareTokenHash = await hashToken(shareToken);

    const shareTtlDays = parseInt(process.env.SHARE_TOKEN_TTL_DAYS || "30", 10);
    const shareExpiresAt = new Date(Date.now() + shareTtlDays * 24 * 60 * 60 * 1000);

    await query(
      `UPDATE game_sessions SET share_token = $1, share_expires_at = $2, updated_at = NOW() WHERE id = $3`,
      [shareTokenHash, shareExpiresAt.toISOString(), sessionId]
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const shareUrl = baseUrl
      ? `${baseUrl}/share/${shareToken}`
      : `/share/${shareToken}`;

    return NextResponse.json({ shareUrl, shareToken });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDb();
    const { sessionId } = await params;

    const sessionRes = await query(
      `SELECT id, owner_token, share_token FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Session not found", 404);
    }

    if (sessionRes.rows[0].owner_token) {
      const ownerToken = request.headers.get("x-owner-token");
      if (!ownerToken) {
        return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
      }
      const valid = await verifyToken(ownerToken, sessionRes.rows[0].owner_token);
      if (!valid) {
        return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
      }
    }

    if (!sessionRes.rows[0].share_token) {
      return apiError(ErrorCodes.VALIDATION, "No active share to revoke", 404);
    }

    await query(
      `UPDATE game_sessions SET share_token = NULL, updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );

    return NextResponse.json({ revoked: true });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
