import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyToken } from "@/lib/crypto";
import { getErrorMessage } from "@/lib/errors";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

async function checkOwnerToken(request: Request, sessionId: string): Promise<Response | null> {
  const sessionCheck = await query(
    `SELECT owner_token FROM game_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionCheck.rows.length === 0) {
    return apiError(ErrorCodes.NOT_FOUND, "Session not found", 404);
  }
  const storedHash = sessionCheck.rows[0].owner_token;
  if (!storedHash) return null;
  const ownerToken = request.headers.get("x-owner-token");
  if (!ownerToken) {
    return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
  }
  const valid = await verifyToken(ownerToken, storedHash);
  if (!valid) {
    return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDb();
    const { sessionId } = await params;

    const sessionRes = await query(
      `SELECT id, seed_prompt, genre, language, rating, status, current_scene_id, state_json, created_at, updated_at, owner_token FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Session not found", 404);
    }

    const session = sessionRes.rows[0];

    const storedHash = session.owner_token;
    if (storedHash) {
      const ownerToken = request.headers.get("x-owner-token");
      if (!ownerToken) {
        return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
      }
      const valid = await verifyToken(ownerToken, storedHash);
      if (!valid) {
        return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
      }
    }

    const scenesRes = await query(
      `SELECT id, turn, title, location, time_of_day, mood, body, memory_summary, chapter_goal, bgm_cue_json, art_prompt_json, npcs_json, choices_json, created_at FROM scenes WHERE session_id = $1 ORDER BY turn`,
      [sessionId]
    );

    const choicesRes = await query(
      `SELECT c.id, c.scene_id, c.label, c.intent, c.risk, c.preview, c.state_effects_json, c.model_choice_id, (c.selected_at IS NOT NULL) AS chosen FROM choices c JOIN scenes s ON c.scene_id = s.id WHERE s.session_id = $1 ORDER BY s.turn, c.id`,
      [sessionId]
    );

    const scenes = scenesRes.rows.map((scene) => {
      const serializedChoices = parseJson<Array<{ id: string; preview?: string }>>(
        scene.choices_json,
        []
      );

      const choices = choicesRes.rows
        .filter((choice) => choice.scene_id === scene.id)
        .map((choice) => {
          const sourceChoice = serializedChoices.find(
            (serialized) => serialized.id === choice.id || serialized.id === choice.model_choice_id
          );

          return {
            id: choice.id,
            label: choice.label,
            intent: choice.intent || "",
            risk: choice.risk || "medium",
            preview: choice.preview || sourceChoice?.preview || "",
            stateEffects: parseJson<Record<string, number>>(choice.state_effects_json, {}),
            modelChoiceId: choice.model_choice_id || undefined,
            chosen: choice.chosen,
          };
        });

      return {
        id: scene.id,
        turn: scene.turn,
        title: scene.title,
        location: scene.location,
        timeOfDay: scene.time_of_day,
        mood: parseJson<string[]>(scene.mood, []),
        body: scene.body,
        memorySummary: scene.memory_summary,
        chapterGoal: scene.chapter_goal,
        bgmCue: parseJson(scene.bgm_cue_json, {}),
        artPrompt: parseJson(scene.art_prompt_json, {}),
        npcs: parseJson(scene.npcs_json, []),
        choices,
        createdAt: scene.created_at,
      };
    });

    const assetRes = session.current_scene_id
      ? await query(
          `SELECT id, status, url FROM asset_jobs WHERE session_id = $1 AND scene_id = $2 AND type = 'image' ORDER BY created_at DESC LIMIT 1`,
          [sessionId, session.current_scene_id]
        )
      : { rows: [] };
    const currentAsset = assetRes.rows[0];

    return NextResponse.json({
      session: {
        id: session.id,
        seedPrompt: session.seed_prompt,
        genre: session.genre,
        language: session.language,
        rating: session.rating,
        status: session.status,
        currentSceneId: session.current_scene_id,
        state: typeof session.state_json === "string" ? JSON.parse(session.state_json) : session.state_json,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
      scenes,
      assets: {
        imageJobId: currentAsset?.id || null,
        imageStatus: currentAsset?.status || "none",
        imageUrl: currentAsset?.url || null,
      },
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      getErrorMessage(error, "Internal server error")
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDb();
    const { sessionId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["ended", "archived"].includes(status)) {
      return apiError(ErrorCodes.VALIDATION, "status must be 'ended' or 'archived'", 400);
    }

    const authError = await checkOwnerToken(request, sessionId);
    if (authError) return authError;

    const res = await query(
      `UPDATE game_sessions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
      [status, sessionId]
    );

    return NextResponse.json({ id: res.rows[0].id, status: res.rows[0].status });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      getErrorMessage(error, "Internal server error")
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

    const authError = await checkOwnerToken(request, sessionId);
    if (authError) return authError;

    const res = await query(
      `DELETE FROM game_sessions WHERE id = $1 RETURNING id`,
      [sessionId]
    );

    return NextResponse.json({ deleted: true, id: res.rows[0].id });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      getErrorMessage(error, "Internal server error")
    );
  }
}
