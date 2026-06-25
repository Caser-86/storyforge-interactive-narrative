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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDb();
    const { sessionId } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json";

    const sessionRes = await query(
      `SELECT id, seed_prompt, genre, language, rating, status, state_json, created_at, owner_token FROM game_sessions WHERE id = $1`,
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

    const session = sessionRes.rows[0];

    const scenesRes = await query(
      `SELECT id, turn, title, location, time_of_day, mood, body, memory_summary, chapter_goal, bgm_cue_json, art_prompt_json, npcs_json, choices_json, created_at FROM scenes WHERE session_id = $1 ORDER BY turn`,
      [sessionId]
    );

    const choicesRes = await query(
      `SELECT c.id, c.scene_id, c.label, c.intent, c.risk, c.preview, c.state_effects_json, c.model_choice_id, (c.selected_at IS NOT NULL) AS chosen FROM choices c JOIN scenes s ON c.scene_id = s.id WHERE s.session_id = $1 ORDER BY s.turn, c.id`,
      [sessionId]
    );

    const scenes = scenesRes.rows.map((scene) => {
      const sceneChoices = typeof scene.choices_json === "string"
        ? JSON.parse(scene.choices_json)
        : scene.choices_json || [];

      const dbChoices = choicesRes.rows
        .filter((c) => c.scene_id === scene.id)
        .map((c) => {
          const choice: Record<string, unknown> = {
            id: c.id,
            label: c.label,
            intent: c.intent,
            risk: c.risk,
            preview: c.preview || sceneChoices.find((sc: { id: string; preview?: string }) => sc.id === c.id || sc.id === c.model_choice_id)?.preview || "",
            chosen: c.chosen,
          };
          return choice;
        });

      return {
        id: scene.id,
        turn: scene.turn,
        title: scene.title,
        location: scene.location,
        timeOfDay: scene.time_of_day,
        mood: typeof scene.mood === "string" ? JSON.parse(scene.mood) : scene.mood,
        body: scene.body,
        memorySummary: scene.memory_summary,
        chapterGoal: scene.chapter_goal,
        bgmCue: typeof scene.bgm_cue_json === "string" ? JSON.parse(scene.bgm_cue_json) : scene.bgm_cue_json,
        artPrompt: (() => {
          const ap = typeof scene.art_prompt_json === "string" ? JSON.parse(scene.art_prompt_json) : scene.art_prompt_json;
          return {
            prompt: ap?.prompt || "",
            negativePrompt: ap?.negativePrompt || "",
            aspectRatio: ap?.aspectRatio || "16:9",
            styleLock: ap?.styleLock || "",
          };
        })(),
        npcs: typeof scene.npcs_json === "string" ? JSON.parse(scene.npcs_json) : scene.npcs_json,
        choices: dbChoices,
        createdAt: scene.created_at,
      };
    });

    if (format === "markdown") {
      const md = renderMarkdown(session, scenes);
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="story-${sessionId.slice(0, 8)}.md"`,
        },
      });
    }

    const safeState = (() => {
      const raw = typeof session.state_json === "string" ? JSON.parse(session.state_json) : session.state_json;
      if (!raw) return {};
      return {
        chapter: raw.chapter,
        turn: raw.turn,
        tone: raw.tone,
        protagonist: raw.protagonist,
        storyGoal: raw.storyGoal,
        currentPhase: raw.currentPhase,
        endingType: raw.endingType,
        endingSummary: raw.endingSummary,
        inventory: raw.inventory,
        knownFacts: raw.knownFacts,
        npcRelations: raw.npcRelations,
      };
    })();

    return NextResponse.json({
      session: {
        id: session.id,
        seedPrompt: session.seed_prompt,
        genre: session.genre,
        language: session.language,
        rating: session.rating,
        status: session.status,
        state: safeState,
        createdAt: session.created_at,
      },
      scenes,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      getErrorMessage(error, "Internal server error")
    );
  }
}

function renderMarkdown(
  session: Record<string, unknown>,
  scenes: Record<string, unknown>[]
): string {
  const lines: string[] = [];

  lines.push(`# ${session.seedPrompt || "互动叙事"}`);
  lines.push(``);
  lines.push(`> **题材**：${session.genre || "未知"} · **语言**：${session.language || "zh"} · **分级**：${session.rating || "PG-13"}`);
  lines.push(`>`);
  lines.push(`> 导出时间：${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const turn = scene.turn as number;
    const title = scene.title as string;
    const location = scene.location as string;
    const timeOfDay = scene.timeOfDay as string;
    const mood = scene.mood as string[];
    const body = scene.body as string;
    const npcs = scene.npcs as Array<{ name: string; role: string; dialogue: string; attitude?: string }>;
    const choices = scene.choices as Array<{ label: string; intent: string; risk: string; chosen: boolean; preview?: string }>;
    const chapterGoal = scene.chapterGoal as string | null;

    lines.push(`## 第 ${turn} 幕：${title}`);
    lines.push(``);
    lines.push(`| 📍 ${location} | 🕐 ${timeOfDay} |${mood?.length ? ` 🎭 ${mood.join("、")} |` : ""}`);
    lines.push(``);
    lines.push(body);
    lines.push(``);

    if (npcs?.length) {
      lines.push(`### 💬 对话`);
      lines.push(``);
      for (const npc of npcs) {
        const attitude = npc.attitude ? `（${npc.attitude}）` : "";
        lines.push(`> **${npc.name}**${attitude}：*"${npc.dialogue}"*`);
        lines.push(``);
      }
    }

    if (choices?.length) {
      lines.push(`### 🔀 选项`);
      lines.push(``);
      for (const choice of choices) {
        const marker = choice.chosen ? "✅" : "⬜";
        const riskEmoji = choice.risk === "high" ? "🔴" : choice.risk === "medium" ? "🟡" : "🟢";
        const preview = choice.preview ? `\n> ${choice.preview}` : "";
        lines.push(`${marker} **${choice.label}** ${riskEmoji}${choice.risk} — *${choice.intent}*${preview}`);
        lines.push(``);
      }
    }

    if (scene.stateEffects && Object.keys(scene.stateEffects as Record<string, unknown>).length > 0) {
      lines.push(`### 📊 状态变化`);
      lines.push(``);
      for (const [key, val] of Object.entries(scene.stateEffects as Record<string, number>)) {
        const arrow = val > 0 ? "↑" : val < 0 ? "↓" : "→";
        lines.push(`- ${key}: ${arrow} ${val > 0 ? "+" : ""}${val}`);
      }
      lines.push(``);
    }

    if (chapterGoal) {
      lines.push(`> 🎯 **章节目标**：${chapterGoal}`);
      lines.push(``);
    }

    if (i < scenes.length - 1) {
      lines.push(`---`);
      lines.push(``);
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  const state = session.state_json as Record<string, unknown> | null;
  if (state) {
    const endingType = state.endingType as string | null;
    const endingSummary = state.endingSummary as string | null;
    const storyGoal = state.storyGoal as string | null;
    const inventory = state.inventory as string[] | null;
    const knownFacts = state.knownFacts as string[] | null;

    if (endingType || endingSummary) {
      lines.push(`## 🏁 结局`);
      lines.push(``);
      if (endingType) lines.push(`**结局类型**：${endingType}`);
      if (endingSummary) lines.push(``);
      if (endingSummary) lines.push(endingSummary);
      lines.push(``);
    }

    if (storyGoal) {
      lines.push(`> 🎯 **故事目标**：${storyGoal}`);
      lines.push(``);
    }

    if (inventory && inventory.length > 0) {
      lines.push(`**持有道具**：${inventory.join("、")}`);
      lines.push(``);
    }

    if (knownFacts && knownFacts.length > 0) {
      lines.push(`**已知事实**：`);
      for (const fact of knownFacts) {
        lines.push(`- ${fact}`);
      }
      lines.push(``);
    }
  }

  lines.push(`*— 故事结束 —*`);
  return lines.join("\n");
}
