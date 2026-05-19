import OpenAI from "openai";
import { NarrativeOutputSchema, type NarrativeOutput } from "./schemas";
import { SYSTEM_PROMPT, buildUserPrompt, RETRY_PROMPT, detectGenre, GENRE_PRESETS } from "./prompts";
import type { StoryState } from "./schemas";
import { compressContext } from "./story-state-service";
import { getPhaseInstruction, shouldForceResolution } from "./story-arc-service";
import { logLlmCall } from "./observability";
import { isWithinBudget } from "./observability-persist";
import { checkArtPromptSafety, checkInputSafety, getRatingPromptSuffix, checkOutputSafety } from "./safety-service";
import { checkRiskCoverage, checkChoiceSimilarity, runAllQualityChecks } from "./narrative-quality";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL || "https://api.deepseek.com",
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || "60000", 10),
      maxRetries: 1,
    });
  }
  return _openai;
}

interface GenerateSceneParams {
  seedPrompt: string;
  language: string;
  rating: string;
  storyState?: StoryState;
  previousSceneSummary?: string;
  selectedChoice?: string;
  sessionId?: string;
  sceneId?: string;
}

export async function generateNarrative(params: GenerateSceneParams): Promise<{
  data: NarrativeOutput;
  latencyMs: number;
  retryCount: number;
}> {
  const { storyState, seedPrompt, sessionId, sceneId } = params;

  if (process.env.MOCK_LLM === "true") {
    const fallback = generateFallbackNarrative(params);
    return { data: fallback, latencyMs: 50, retryCount: 0 };
  }

  if (!isWithinBudget()) {
    throw new Error("BUDGET_EXCEEDED: daily token/asset limit reached");
  }

  const genre = seedPrompt ? detectGenre(seedPrompt) : null;
  const preset = genre ? GENRE_PRESETS[genre] : null;

  const styleBible = storyState?.styleBible?.visualStyle || preset?.styleBible || "";
  const characterCard = storyState?.protagonist
    ? `${storyState.protagonist.name}（${storyState.protagonist.traits.join("、")}）`
    : "";

  const userPrompt = buildUserPrompt({
    seedPrompt: params.seedPrompt,
    language: params.language,
    rating: params.rating,
    storyState: storyState ? compressContext(storyState) : undefined,
    previousSceneSummary: params.previousSceneSummary,
    selectedChoice: params.selectedChoice,
    styleBible: styleBible || undefined,
    characterCard: characterCard || undefined,
    storyPhase: storyState?.currentPhase,
    targetTurns: storyState?.targetTurns,
    remainingTurns: storyState ? storyState.targetTurns - storyState.turn : undefined,
    phaseInstruction: storyState ? getPhaseInstruction(storyState) : undefined,
    allowNewThreads: storyState?.allowNewThreads,
    mustResolveThreads: storyState ? shouldForceResolution(storyState) : false,
  });

  const model = process.env.OPENAI_MODEL || "deepseek-chat";
  const maxRetries = 2;
  let retryCount = 0;
  let qualityIssues: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();

    try {
      let retrySuffix = "";
      if (attempt > 0) {
        retrySuffix = qualityIssues.length > 0
          ? `\n\n上一次输出存在以下质量问题，请修复：\n${qualityIssues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}\n\n请确保输出严格符合 JSON Schema。`
          : `\n\n${RETRY_PROMPT}`;
      }

      const response = await getOpenAI().chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + getRatingPromptSuffix(params.rating) },
          { role: "user", content: `${userPrompt}${retrySuffix}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.85,
        max_tokens: 3000,
      });

      const latencyMs = Date.now() - start;
      const raw = response.choices[0]?.message?.content;

      if (!raw) {
        throw new Error("LLM returned empty content");
      }

      const inputTokens = response.usage?.prompt_tokens;
      const outputTokens = response.usage?.completion_tokens;

      try {
        const parsed = JSON.parse(raw);
        const validated = NarrativeOutputSchema.parse(parsed);

        const artSafety = checkArtPromptSafety(validated.scene.artPrompt.prompt);
        if (!artSafety.safe) {
          validated.scene.artPrompt.prompt = "safe abstract landscape, no characters";
          validated.safety.contentWarnings.push(...artSafety.warnings);
        }

        const outputSafety = checkOutputSafety({
          body: validated.scene.body,
          npcs: validated.scene.npcs.map((n) => ({
            dialogue: n.dialogue,
            hiddenIntent: n.hiddenIntent,
          })),
          artPrompt: validated.scene.artPrompt.prompt,
          musicPrompt: validated.scene.bgmCue.mood,
        });
        if (!outputSafety.safe) {
          validated.safety.contentWarnings.push(...outputSafety.warnings);
        }

        const bodySafety = checkInputSafety(validated.scene.body);
        if (!bodySafety.safe) {
          validated.safety.contentWarnings.push(...bodySafety.warnings);
        }

        for (const npc of validated.scene.npcs) {
          const npcSafety = checkInputSafety(npc.dialogue);
          if (!npcSafety.safe) {
            npc.dialogue = "...";
            validated.safety.contentWarnings.push(`NPC ${npc.name} 对话已过滤`);
          }
        }

        const riskCheck = checkRiskCoverage(validated.scene.choices);
        if (!riskCheck.passed) {
          validated.safety.contentWarnings.push(...riskCheck.issues);
        }

        const simCheck = checkChoiceSimilarity(validated.scene.choices);
        if (!simCheck.passed) {
          validated.safety.contentWarnings.push(...simCheck.issues);
        }

        const knownThreads = storyState?.unresolvedThreads || [];
        const turn = storyState?.turn || 1;
        const qualityResult = runAllQualityChecks(validated, knownThreads, turn);
        if (!qualityResult.passed) {
          validated.safety.contentWarnings.push(...qualityResult.issues);
        }

        if (qualityResult.shouldRetry && attempt < maxRetries) {
          qualityIssues = qualityResult.issues;
          retryCount++;
          continue;
        }

        if (!validated.statePatch.styleBible && preset?.styleBible) {
          validated.statePatch.styleBible = {
            visualStyle: preset.styleBible,
            musicStyle: validated.scene.bgmCue.mood,
          };
        }

        if (!validated.statePatch.protagonist && storyState?.protagonist?.name === "未命名主角") {
          const bodyText = validated.scene.body;
          const nameMatch = bodyText.match(/(?:你叫|你是|名为|名叫)\s*[「"']?([^\s「"'，。！？]{1,8})/);
          if (nameMatch) {
            validated.statePatch.protagonist = {
              name: nameMatch[1],
              traits: storyState?.protagonist?.traits || [],
            };
          }
        }

        if (validated.scene.artPrompt?.styleLock && !validated.statePatch.styleBible) {
          validated.statePatch.styleBible = {
            visualStyle: validated.scene.artPrompt.styleLock,
            musicStyle: validated.scene.bgmCue.mood,
          };
        }

        logLlmCall({
          sessionId: sessionId || "unknown",
          sceneId,
          model,
          latencyMs,
          inputTokens,
          outputTokens,
          retryCount,
          success: true,
          timestamp: new Date().toISOString(),
        });

        return { data: validated, latencyMs, retryCount };
      } catch (validationError) {
        retryCount++;
        if (attempt === maxRetries) {
          logLlmCall({
            sessionId: sessionId || "unknown",
            sceneId,
            model,
            latencyMs,
            inputTokens,
            outputTokens,
            retryCount,
            success: false,
            error: `Schema validation failed: ${validationError}`,
            timestamp: new Date().toISOString(),
          });
          throw new Error(`Schema validation failed after ${maxRetries + 1} attempts: ${validationError}`);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === "LLM returned empty content") {
        const latencyMs = Date.now() - start;
        logLlmCall({
          sessionId: sessionId || "unknown",
          sceneId,
          model,
          latencyMs,
          retryCount,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
      throw error;
    }
  }

  throw new Error("Unreachable");
}

export function generateFallbackNarrative(params: GenerateSceneParams): NarrativeOutput {
  const genre = params.seedPrompt ? detectGenre(params.seedPrompt) : null;
  const preset = genre ? GENRE_PRESETS[genre] : null;
  const styleLock = preset?.styleBible || "atmospheric digital art";

  const fallback = {
    scene: {
      title: "迷雾中的岔路",
      location: "未知之地——被永恒迷雾笼罩的荒原",
      timeOfDay: "黄昏",
      mood: ["神秘", "紧张"],
      body: `你站在一片浓重的迷雾之中，四周灰蒙蒙的，完全看不清方向。空气中弥漫着潮湿的泥土气息，远处隐约传来低沉的回响，但无法辨别来源。脚下的路面崎岖不平，碎石和枯叶混在一起，每一步都发出细微的声响。\n\n前方出现了两条截然不同的路——一条通向暗处，幽深的黑暗仿佛能吞噬一切光芒；另一条路尽头似乎有微弱的光芒在闪烁，温暖而遥远。迷雾在你身边缓缓流动，仿佛有生命一般。\n\n你必须做出选择，因为留在这里只会让迷雾越来越浓。`,
      npcs: [
        {
          id: "npc_mysterious_voice",
          name: "神秘声音",
          role: "引导者",
          attitude: "中立",
          dialogue: "选择你的路吧，旅人。每条路都有代价，没有回头的机会。",
          hiddenIntent: "测试旅人的决心与智慧，观察其在压力下的判断力",
        },
      ],
      choices: [
        {
          id: "choice_a",
          label: "走向光芒的方向",
          intent: "追寻希望的微光，相信光明意味着安全",
          risk: "low" as const,
          route: "investigate" as const,
          preview: "微弱的光芒可能意味着安全，但也可能是陷阱",
          stateEffects: { hope: 5 },
        },
        {
          id: "choice_b",
          label: "踏入黑暗深处",
          intent: "探索未知的黑暗，寻找隐藏的真相",
          risk: "medium" as const,
          route: "act" as const,
          preview: "黑暗中或许藏着真相，但也充满危险",
          stateEffects: { courage: 5 },
        },
        {
          id: "choice_c",
          label: "原地等待观察",
          intent: "耐心观察局势变化，等待迷雾散去",
          risk: "high" as const,
          route: "sacrifice" as const,
          preview: "迷雾或许会自行散去，但也可能永远不会消散",
          stateEffects: { patience: 3, anxiety: -5 },
        },
      ],
      artPrompt: {
        prompt: `${styleLock}, foggy crossroads at dusk, mysterious atmosphere, two paths diverging, one with faint light, one into darkness, cinematic lighting`,
        negativePrompt: "text, watermark, blurry, low quality, deformed",
        styleLock,
        aspectRatio: "16:9" as const,
        seedHint: Math.floor(Math.random() * 999999),
      },
      bgmCue: {
        mood: "mysterious and tense atmospheric exploration",
        bpm: 72,
        instruments: ["strings", "piano", "ambient_pad"],
        loopSeconds: 32 as const,
        musicPrompt: "ambient mysterious fog exploration strings piano slow atmospheric tension building",
        sfx: ["wind", "distant_echo"],
      },
      memorySummary: "主角在迷雾笼罩的荒原中面临岔路选择，神秘声音引导做出抉择",
      chapterGoal: "在迷雾笼罩的荒原中找到正确的前进方向，穿越危险地带抵达安全之地",
    },
    statePatch: {},
    safety: { rating: "PG-13" as const, contentWarnings: [] },
  };

  return NarrativeOutputSchema.parse(fallback);
}
