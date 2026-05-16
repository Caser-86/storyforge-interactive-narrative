import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateNarrative } from "@/lib/narrative-service";
import { applyChoiceEffects, compressContext } from "@/lib/story-state-service";
import { computePromptHash } from "@/lib/asset-service";
import { query, initDb } from "@/lib/db";
import type { StoryState, Choice } from "@/lib/schemas";

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
    const body = await request.json();
    const { sceneId, choiceId } = body;

    if (!sceneId || !choiceId) {
      return NextResponse.json({ error: "sceneId and choiceId are required" }, { status: 400 });
    }

    const sessionRes = await query(
      `SELECT id, state_json, status FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const session = sessionRes.rows[0];
    if (session.status !== "active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }

    const storyState: StoryState = typeof session.state_json === "string"
      ? JSON.parse(session.state_json)
      : session.state_json;

    const choiceRes = await query(
      `SELECT id, label, intent, risk, state_effects_json FROM choices WHERE scene_id = $1 AND id = $2`,
      [sceneId, choiceId]
    );

    if (choiceRes.rows.length === 0) {
      return NextResponse.json({ error: "Choice not found" }, { status: 404 });
    }

    const choiceRow = choiceRes.rows[0];
    const selectedChoice: Choice = {
      id: choiceRow.id,
      label: choiceRow.label,
      intent: choiceRow.intent,
      risk: choiceRow.risk,
      preview: "",
      stateEffects: typeof choiceRow.state_effects_json === "string"
        ? JSON.parse(choiceRow.state_effects_json)
        : choiceRow.state_effects_json,
    };

    await query(
      `UPDATE choices SET selected_at = NOW() WHERE id = $1`,
      [choiceId]
    );

    const prevSceneRes = await query(
      `SELECT memory_summary FROM scenes WHERE id = $1`,
      [sceneId]
    );
    const previousSummary = prevSceneRes.rows[0]?.memory_summary || "";

    const { data: narrative, latencyMs: llmMs } = await generateNarrative({
      seedPrompt: "",
      language: "zh-CN",
      rating: "PG-13",
      storyState: compressContext(storyState),
      previousSceneSummary: previousSummary,
      selectedChoice: `${selectedChoice.label}（${selectedChoice.intent}）`,
    });

    const newState = applyChoiceEffects(storyState, selectedChoice, narrative.statePatch);

    const newSceneId = `scene_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    await query(
      `INSERT INTO scenes (id, session_id, turn, title, location, body, npcs_json, choices_json, art_prompt_json, bgm_cue_json, memory_summary, mood, time_of_day, chapter_goal, raw_model_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        newSceneId,
        sessionId,
        newState.turn,
        narrative.scene.title,
        narrative.scene.location,
        narrative.scene.body,
        JSON.stringify(narrative.scene.npcs),
        JSON.stringify(narrative.scene.choices),
        JSON.stringify(narrative.scene.artPrompt),
        JSON.stringify(narrative.scene.bgmCue),
        narrative.scene.memorySummary,
        JSON.stringify(narrative.scene.mood),
        narrative.scene.timeOfDay,
        narrative.scene.chapterGoal,
        JSON.stringify(narrative),
      ]
    );

    for (const choice of narrative.scene.choices) {
      await query(
        `INSERT INTO choices (id, scene_id, session_id, label, intent, risk, state_effects_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [choice.id, newSceneId, sessionId, choice.label, choice.intent, choice.risk, JSON.stringify(choice.stateEffects)]
      );
    }

    await query(
      `UPDATE game_sessions SET current_scene_id = $1, state_json = $2, updated_at = NOW() WHERE id = $3`,
      [newSceneId, JSON.stringify(newState), sessionId]
    );

    const assetJobId = `asset_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    const promptHash = computePromptHash(narrative.scene.artPrompt);

    await query(
      `INSERT INTO asset_jobs (id, session_id, scene_id, type, provider, status, prompt_hash, prompt_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        assetJobId,
        sessionId,
        newSceneId,
        "image",
        process.env.IMAGE_PROVIDER || "mock",
        "queued",
        promptHash,
        JSON.stringify(narrative.scene.artPrompt),
      ]
    );

    const stateDiff: Record<string, number> = {};
    for (const [key, value] of Object.entries(selectedChoice.stateEffects)) {
      stateDiff[key] = value;
    }

    return NextResponse.json({
      sessionId,
      previousChoiceId: choiceId,
      scene: {
        id: newSceneId,
        title: narrative.scene.title,
        location: narrative.scene.location,
        timeOfDay: narrative.scene.timeOfDay,
        mood: narrative.scene.mood,
        body: narrative.scene.body,
        npcs: narrative.scene.npcs,
        choices: narrative.scene.choices,
        artPrompt: narrative.scene.artPrompt,
        bgmCue: narrative.scene.bgmCue,
        chapterGoal: narrative.scene.chapterGoal,
        memorySummary: narrative.scene.memorySummary,
      },
      stateDiff,
      safety: narrative.safety,
      assets: {
        imageJobId: assetJobId,
        imageStatus: "queued",
      },
      timing: {
        llmMs,
      },
    });
  } catch (error) {
    console.error("POST /api/games/[sessionId]/choices error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
