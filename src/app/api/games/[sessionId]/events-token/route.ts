import { NextResponse } from "next/server";
import { initDb, query } from "@/lib/db";
import { verifyToken } from "@/lib/crypto";
import { signStreamToken } from "@/lib/crypto";
import { apiError, ErrorCodes } from "@/lib/api-errors";

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
    const ownerToken = request.headers.get("x-owner-token");

    if (!ownerToken) {
      return apiError(ErrorCodes.UNAUTHORIZED, "Owner token required", 401);
    }

    const result = await query(
      `SELECT owner_token_hash FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Session not found", 404);
    }

    const valid = await verifyToken(ownerToken, result.rows[0].owner_token_hash);
    if (!valid) {
      return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
    }

    const streamToken = signStreamToken(sessionId, ownerToken);
    return NextResponse.json({ streamToken });
  } catch (error) {
    return apiError(ErrorCodes.INTERNAL, error instanceof Error ? error.message : "Internal server error", 500);
  }
}
