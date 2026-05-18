import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyToken } from "@/lib/crypto";

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
        .map((c) => ({
          id: c.id,
          label: c.label,
          intent: c.intent,
          risk: c.risk,
          preview: c.preview || sceneChoices.find((sc: { id: string; preview?: string }) => sc.id === c.id || sc.id === c.model_choice_id)?.preview || "",
          stateEffects: typeof c.state_effects_json === "string" ? JSON.parse(c.state_effects_json) : c.state_effects_json,
          modelChoiceId: c.model_choice_id || undefined,
          chosen: c.chosen,
        }));

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

    return NextResponse.json({
      session: {
        id: session.id,
        seedPrompt: session.seed_prompt,
        genre: session.genre,
        language: session.language,
        rating: session.rating,
        status: session.status,
        state: typeof session.state_json === "string" ? JSON.parse(session.state_json) : session.state_json,
        createdAt: session.created_at,
      },
      scenes,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(
      ErrorCodes.INTERNAL,
      error instanceof Error ? error.message : "Internal server error"
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
  lines.push(`> 题材：${session.genre || "未知"} | 语言：${session.language || "zh"} | 分级：${session.rating || "PG-13"}`);
  lines.push(`> 导出时间：${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  for (const scene of scenes) {
    const turn = scene.turn as number;
    const title = scene.title as string;
    const location = scene.location as string;
    const timeOfDay = scene.timeOfDay as string;
    const mood = scene.mood as string[];
    const body = scene.body as string;
    const npcs = scene.npcs as Array<{ name: string; role: string; dialogue: string }>;
    const choices = scene.choices as Array<{ label: string; intent: string; risk: string; chosen: boolean }>;
    const chapterGoal = scene.chapterGoal as string | null;

    lines.push(`## 第 ${turn} 幕：${title}`);
    lines.push(``);
    lines.push(`📍 ${location} · 🕐 ${timeOfDay}`);
    if (mood?.length) {
      lines.push(`🎭 ${mood.join("、")}`);
    }
    lines.push(``);
    lines.push(body);
    lines.push(``);

    if (npcs?.length) {
      lines.push(`### NPC`);
      for (const npc of npcs) {
        lines.push(`- **${npc.name}**（${npc.role}）："${npc.dialogue}"`);
      }
      lines.push(``);
    }

    if (choices?.length) {
      lines.push(`### 选项`);
      for (const choice of choices) {
        const marker = choice.chosen ? "✅" : "⬜";
        lines.push(`- ${marker} **${choice.label}** [${choice.risk}] — ${choice.intent}`);
      }
      lines.push(``);
    }

    if (chapterGoal) {
      lines.push(`> 🎯 章节目标：${chapterGoal}`);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`*— 故事结束 —*`);
  return lines.join("\n");
}
