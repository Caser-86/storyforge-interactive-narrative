import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";

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

    const sessionRes = await query(
      `SELECT id, seed_prompt, genre, language, rating, status, state_json, created_at FROM game_sessions WHERE share_token = $1`,
      [token]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const session = sessionRes.rows[0];

    const scenesRes = await query(
      `SELECT id, turn, title, location, time_of_day, mood, body, npcs_json, chapter_goal FROM scenes WHERE session_id = $1 ORDER BY turn`,
      [session.id]
    );

    const scenes = scenesRes.rows.map((s) => ({
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
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
}
