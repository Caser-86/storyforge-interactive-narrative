import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateNarrative, generateFallbackNarrative } from "@/lib/narrative-service";
import { applyChoiceEffects } from "@/lib/story-state-service";
import { advanceStoryArc, shouldEndStory, determineEndingType } from "@/lib/story-arc-service";
import { computePromptHash } from "@/lib/asset-service";
import { enqueueAssetJob } from "@/lib/asset-queue";
import { query, initDb, withTransaction } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyToken } from "@/lib/crypto";
import { ChoiceResponseSchema, validateResponse } from "@/lib/api-contracts";
import type { StoryState, Choice } from "@/lib/schemas";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

function makeChoiceId(sceneId: string, suffix: string): string {
  const sceneSuffix = sceneId.replace(/^scene_/, "").slice(0, 8);
  return `choice_${sceneSuffix}_${suffix}`;
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
      return apiError(ErrorCodes.VALIDATION, "sceneId and choiceId are required", 400);
    }

    const sessionRes = await query(
      `SELECT id, state_json, status, language, rating, owner_token FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Session not found", 404);
    }

    const session = sessionRes.rows[0];

    const ownerToken = request.headers.get("x-owner-token");
    if (session.owner_token) {
      if (!ownerToken) {
        return apiError(ErrorCodes.FORBIDDEN, "Missing owner token", 403);
      }
      const valid = await verifyToken(ownerToken, session.owner_token);
      if (!valid) {
        return apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
      }
    }

    if (session.status !== "active") {
      return apiError(ErrorCodes.SESSION_INACTIVE, "Session is not active", 400);
    }

    const storyState: StoryState = typeof session.state_json === "string"
      ? JSON.parse(session.state_json)
      : session.state_json;

    const language = session.language || "zh-CN";
    const rating = session.rating || "PG-13";

    const choiceRes = await query(
      `SELECT id, label, intent, risk, preview, state_effects_json, selected_at FROM choices WHERE scene_id = $1 AND id = $2 AND session_id = $3`,
      [sceneId, choiceId, sessionId]
    );

    if (choiceRes.rows.length === 0) {
      return apiError(ErrorCodes.NOT_FOUND, "Choice not found or does not belong to this session", 404);
    }

    const choiceRow = choiceRes.rows[0];
    const selectedChoice: Choice = {
      id: choiceRow.id,
      label: choiceRow.label,
      intent: choiceRow.intent,
      risk: choiceRow.risk,
      preview: choiceRow.preview || "",
      stateEffects: typeof choiceRow.state_effects_json === "string"
        ? JSON.parse(choiceRow.state_effects_json)
        : choiceRow.state_effects_json,
    };

    if (choiceRow.selected_at) {
      return apiError(ErrorCodes.DUPLICATE, "This choice has already been selected", 409);
    }

    const prevSceneRes = await query(
      `SELECT memory_summary FROM scenes WHERE id = $1 AND session_id = $2`,
      [sceneId, sessionId]
    );
    const previousSummary = prevSceneRes.rows[0]?.memory_summary || "";

    const newSceneId = `scene_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    let narrative;
    let llmMs = 0;
    let usedFallback = false;
    let llmError: string | null = null;

    try {
      const result = await generateNarrative({
        seedPrompt: "",
        language,
        rating,
        storyState,
        previousSceneSummary: previousSummary,
        selectedChoice: `${selectedChoice.label}（${selectedChoice.intent}）`,
        sessionId,
        sceneId: newSceneId,
      });
      narrative = result.data;
      llmMs = result.latencyMs;
    } catch (llmErr) {
      usedFallback = true;
      llmError = llmErr instanceof Error ? llmErr.message : String(llmErr);
      narrative = generateFallbackNarrative({
        seedPrompt: "",
        language,
        rating,
        storyState,
        previousSceneSummary: previousSummary,
        selectedChoice: `${selectedChoice.label}（${selectedChoice.intent}）`,
        sessionId,
        sceneId: newSceneId,
      });
    }

    const newState = applyChoiceEffects(storyState, selectedChoice, narrative.statePatch);
    const arcState = advanceStoryArc(newState);
    const isEnding = shouldEndStory(arcState);

    if (isEnding && !arcState.endingType) {
      arcState.endingType = determineEndingType(arcState);
    }

    const enableImages = arcState.flags?.imageGenerationEnabled === true;
    const assetJobId = enableImages ? `asset_${uuidv4().replace(/-/g, "").slice(0, 12)}` : null;
    const promptHash = enableImages ? computePromptHash(narrative.scene.artPrompt) : null;

    await withTransaction(async (tx) => {
      const markResult = await tx.query(
        `UPDATE choices SET selected_at = NOW() WHERE id = $1 AND selected_at IS NULL RETURNING id`,
        [choiceId]
      );

      if (markResult.rows.length === 0) {
        throw new Error("DUPLICATE_CHOICE");
      }

      await tx.query(
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
        const modelId = choice.id;
        const safeId = makeChoiceId(newSceneId, modelId);
        await tx.query(
          `INSERT INTO choices (id, scene_id, session_id, label, intent, risk, preview, state_effects_json, model_choice_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [safeId, newSceneId, sessionId, choice.label, choice.intent, choice.risk, choice.preview, JSON.stringify(choice.stateEffects), modelId]
        );
        choice.id = safeId;
      }

      await tx.query(
        `UPDATE game_sessions SET current_scene_id = $1, state_json = $2, updated_at = NOW() WHERE id = $3`,
        [newSceneId, JSON.stringify(arcState), sessionId]
      );

      if (isEnding) {
        await tx.query(
          `UPDATE game_sessions SET status = 'ended', updated_at = NOW() WHERE id = $1`,
          [sessionId]
        );
      }

      if (enableImages && assetJobId && promptHash) {
        await tx.query(
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
      }
    });

    if (enableImages && assetJobId) {
      try {
        const enqueueResult = await enqueueAssetJob({
          assetJobId,
          sessionId,
          sceneId: newSceneId,
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

    const stateDiff: Record<string, number> = {};
    for (const [key, value] of Object.entries(selectedChoice.stateEffects)) {
      stateDiff[key] = value as number;
    }

    return NextResponse.json(validateResponse(ChoiceResponseSchema, {
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
        imageStatus: enableImages ? "queued" : "none",
      },
      timing: {
        llmMs,
      },
      meta: {
        usedFallback,
        llmError,
        imageGenerationEnabled: enableImages,
      },
      sessionStatus: isEnding ? "ended" : "active",
      storyProgress: {
        turn: arcState.turn,
        targetTurns: arcState.targetTurns,
        currentPhase: arcState.currentPhase,
        endingReadiness: arcState.endingReadiness,
      },
      isEnding,
    }, `POST /api/games/${sessionId}/choices`));
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_CHOICE") {
      return apiError(ErrorCodes.DUPLICATE, "This choice has already been selected", 409);
    }
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
