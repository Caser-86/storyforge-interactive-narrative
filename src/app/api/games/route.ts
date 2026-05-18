import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateNarrative, generateFallbackNarrative } from "@/lib/narrative-service";
import { createInitialState } from "@/lib/story-state-service";
import { computePromptHash } from "@/lib/asset-service";
import { checkInputSafety } from "@/lib/safety-service";
import { enqueueAssetJob } from "@/lib/asset-queue";
import { initDb, withTransaction, query } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { getOrCreateUser } from "@/lib/user-service";
import { hashToken } from "@/lib/crypto";
import { shouldGenerateImages } from "@/lib/feature-flags";

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
    const requestOptions = typeof options === "object" && options !== null
      ? options as Record<string, unknown>
      : {};
    const enableImages = shouldGenerateImages(requestOptions);

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return apiError(ErrorCodes.VALIDATION, "prompt is required", 400);
    }

    const safetyCheck = checkInputSafety(prompt);
    if (!safetyCheck.safe) {
      return apiError(ErrorCodes.VALIDATION, "输入内容不安全，请修改后重试", 400);
    }

    const effectivePrompt = safetyCheck.rewritten || prompt;
    const sessionId = `sess_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    const fingerprint = request.headers.get("x-user-fingerprint") || "anonymous";
    let userId: string | null = null;
    try {
      const user = await getOrCreateUser(fingerprint);
      userId = user.id;
    } catch { /* user system optional */ }
    const storyState = createInitialState(sessionId, effectivePrompt);
    const visualStyle = typeof requestOptions.visualStyle === "string" ? requestOptions.visualStyle : "";
    storyState.styleBible.visualStyle = visualStyle;
    storyState.styleBible.musicStyle = "";
    storyState.flags.imageGenerationEnabled = enableImages;

    const sceneId = `scene_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    const llmStart = Date.now();
    let narrative;
    let llmMs = 0;
    let usedFallback = false;
    let llmError: string | null = null;

    try {
      const result = await generateNarrative({
        seedPrompt: effectivePrompt,
        language,
        rating,
        storyState,
        sessionId,
        sceneId,
      });
      narrative = result.data;
      llmMs = result.latencyMs;
    } catch (llmErr) {
      usedFallback = true;
      llmError = llmErr instanceof Error ? llmErr.message : String(llmErr);
      narrative = generateFallbackNarrative({
        seedPrompt: effectivePrompt,
        language,
        rating,
        storyState,
        sessionId,
        sceneId,
      });
      llmMs = Date.now() - llmStart;
    }

    storyState.tone = narrative.scene.mood.join("、");
    storyState.styleBible.visualStyle = narrative.scene.artPrompt.styleLock;
    storyState.styleBible.musicStyle = narrative.scene.bgmCue.mood;

    const assetJobId = enableImages ? `asset_${uuidv4().replace(/-/g, "").slice(0, 12)}` : null;
    const promptHash = enableImages ? computePromptHash(narrative.scene.artPrompt) : null;
    const ownerToken = `ot_${uuidv4().replace(/-/g, "")}`;
    const ownerTokenHash = await hashToken(ownerToken);

    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO game_sessions (id, seed_prompt, genre, language, rating, status, current_scene_id, state_json, user_id, owner_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sessionId,
          effectivePrompt,
          visualStyle || "general",
          language,
          rating,
          "active",
          sceneId,
          JSON.stringify(storyState),
          userId,
          ownerTokenHash,
        ]
      );

      await tx.query(
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
        const modelId = choice.id;
        const safeId = `choice_${sceneId.replace(/^scene_/, "").slice(0, 8)}_${modelId}`;
        await tx.query(
          `INSERT INTO choices (id, scene_id, session_id, label, intent, risk, preview, state_effects_json, model_choice_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            safeId,
            sceneId,
            sessionId,
            choice.label,
            choice.intent,
            choice.risk,
            choice.preview,
            JSON.stringify(choice.stateEffects),
            modelId,
          ]
        );
        choice.id = safeId;
      }

      if (enableImages && assetJobId && promptHash) {
        await tx.query(
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
      }
    });

    if (enableImages && assetJobId) {
      try {
        const enqueueResult = await enqueueAssetJob({
          assetJobId,
          sessionId,
          sceneId,
          promptJson: narrative.scene.artPrompt,
          provider: process.env.IMAGE_PROVIDER || "mock",
        });
        if (!enqueueResult.queued) {
          try {
            await query(
              `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
              ["Worker unavailable: " + (enqueueResult.reason || "unknown"), assetJobId]
            );
          } catch { /* best effort */ }
        }
      } catch (queueErr) {
        console.warn("Failed to enqueue asset job:", queueErr instanceof Error ? queueErr.message : queueErr);
        try {
          await query(
            `UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2`,
            ["Worker unavailable: " + (queueErr instanceof Error ? queueErr.message : String(queueErr)), assetJobId]
          );
        } catch { /* best effort */ }
      }
    }

    return NextResponse.json({
      sessionId,
      ownerToken,
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
        imageStatus: enableImages ? "queued" : "none",
      },
      timing: {
        llmMs,
        totalMs: Date.now() - llmStart,
      },
      meta: {
        usedFallback,
        llmError,
        inputRewritten: !!safetyCheck.rewritten,
        safetyWarnings: safetyCheck.warnings,
        imageGenerationEnabled: enableImages,
      },
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
