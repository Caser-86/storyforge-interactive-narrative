import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { apiError, ErrorCodes } from "@/lib/api-errors";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await ensureDb();
    const { token } = await params;
    const tokenHash = await hashToken(token);

    const sessionRes = await query(
      `SELECT id, seed_prompt, genre, language, rating, status, state_json, created_at, share_expires_at FROM game_sessions WHERE share_token = $1`,
      [tokenHash]
    );

    if (sessionRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Share not found or expired", 404);
    }

    const session = sessionRes.rows[0];

    if (session.share_expires_at && new Date(session.share_expires_at) < new Date()) {
      return apiError(ErrorCodes.NOT_FOUND, "Share link has expired", 410);
    }

    const scenesRes = await query(
      `SELECT id, turn, title, location, time_of_day, mood, body, npcs_json, chapter_goal FROM scenes WHERE session_id = $1 ORDER BY turn`,
      [session.id]
    );

    const scenes = scenesRes.rows.map((s) => ({
      id: s.id,
      turn: s.turn,
      title: s.title,
      location: s.location,
      timeOfDay: s.time_of_day,
      mood: typeof s.mood === "string" ? JSON.parse(s.mood) : s.mood,
      body: s.body,
      npcs: typeof s.npcs_json === "string" ? JSON.parse(s.npcs_json) : s.npcs_json,
      chapterGoal: s.chapter_goal,
    }));

    return NextResponse.json({
      session: {
        seedPrompt: session.seed_prompt,
        genre: session.genre,
        rating: session.rating,
      },
      scenes,
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
