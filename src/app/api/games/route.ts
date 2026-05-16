import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateNarrative } from "@/lib/narrative-service";
import { createInitialState, compressContext } from "@/lib/story-state-service";
import { computePromptHash } from "@/lib/asset-service";
import { checkInputSafety } from "@/lib/safety-service";
import { query, initDb } from "@/lib/db";
import type { StoryState } from "@/lib/schemas";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();

    const body = await request.json();
    const { prompt, language = "zh-CN", rating = "PG-13", options = {} } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const safetyCheck = checkInputSafety(prompt);
    if (!safetyCheck.safe) {
      return NextResponse.json(
        { error: "输入内容不安全，请修改后重试", warnings: safetyCheck.warnings },
        { status: 400 }
      );
    }

    const effectivePrompt = safetyCheck.rewritten || prompt;
    const sessionId = `sess_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    const storyState = createInitialState(sessionId, effectivePrompt);
    storyState.styleBible.visualStyle = options.visualStyle || "";
    storyState.styleBible.musicStyle = "";

    const llmStart = Date.now();
    const { data: narrative, latencyMs: llmMs } = await generateNarrative({
      seedPrompt: effectivePrompt,
      language,
      rating,
      storyState: compressContext(storyState),
    });
    const llmEnd = Date.now();

    storyState.tone = narrative.scene.mood.join("、");
    storyState.styleBible.visualStyle = narrative.scene.artPrompt.styleLock;
    storyState.styleBible.musicStyle = narrative.scene.bgmCue.mood;

    const sceneId = `scene_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    await query(
      `INSERT INTO game_sessions (id, seed_prompt, genre, language, rating, status, current_scene_id, state_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        effectivePrompt,
        options.visualStyle || "general",
        language,
        rating,
        "active",
        sceneId,
        JSON.stringify(storyState),
      ]
    );

    await query(
      `INSERT INTO scenes (id, session_id, turn, title, location, body, npcs_json, choices_json, art_prompt_json, bgm_cue_json, memory_summary, mood, time_of_day, chapter_goal, raw_model_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        sceneId,
        sessionId,
        1,
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
      const choiceId = choice.id;
      await query(
        `INSERT INTO choices (id, scene_id, session_id, label, intent, risk, state_effects_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          choiceId,
          sceneId,
          sessionId,
          choice.label,
          choice.intent,
          choice.risk,
          JSON.stringify(choice.stateEffects),
        ]
      );
    }

    const assetJobId = `asset_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    const promptHash = computePromptHash(narrative.scene.artPrompt);

    await query(
      `INSERT INTO asset_jobs (id, session_id, scene_id, type, provider, status, prompt_hash, prompt_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        assetJobId,
        sessionId,
        sceneId,
        "image",
        process.env.IMAGE_PROVIDER || "mock",
        "queued",
        promptHash,
        JSON.stringify(narrative.scene.artPrompt),
      ]
    );

    return NextResponse.json({
      sessionId,
      scene: {
        id: sceneId,
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
      statePatch: narrative.statePatch,
      safety: narrative.safety,
      assets: {
        imageJobId: assetJobId,
        imageStatus: "queued",
      },
      timing: {
        llmMs,
        totalMs: Date.now() - llmStart,
      },
    });
  } catch (error) {
    console.error("POST /api/games error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
