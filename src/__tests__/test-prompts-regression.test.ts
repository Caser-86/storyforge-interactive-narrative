import { describe, it, expect } from "vitest";
import { TEST_PROMPTS_FIXTURES, TEST_PROMPTS, initMetrics, type RegressionMetrics } from "@/lib/test-prompts";
import { NarrativeOutputSchema } from "@/lib/schemas";
import { checkChoiceSimilarity, checkRiskCoverage, checkNpcCount, checkChapterProgression, checkRouteCoverage, checkMainlineAdvancement, checkCostExposure, runAllQualityChecks } from "@/lib/narrative-quality";
import { detectGenre } from "@/lib/prompts";
import type { NarrativeOutput } from "@/lib/schemas";

function makeNarrative(overrides: Partial<NarrativeOutput["scene"]> = {}): NarrativeOutput {
  return {
    scene: {
      title: "测试场景",
      location: "测试地点",
      timeOfDay: "夜晚",
      mood: ["紧张", "神秘"],
      body: "你走进了一间昏暗的房间，空气中弥漫着陈旧的气息。墙角的蜡烛摇曳不定，投下诡异的影子。你注意到桌上有一封泛黄的信件，上面写着你看不懂的符号。远处传来若有若无的脚步声，让你不禁屏住了呼吸。你环顾四周，发现墙壁上挂着一幅古老的画像，画中人的眼睛似乎在注视着你。地板上散落着一些破碎的瓷片，似乎有人在这里发生过争执。一股寒意从脚底升起，你感到这个房间隐藏着不为人知的秘密。",
      npcs: [
        {
          id: "npc_guide",
          name: "神秘向导",
          role: "向导",
          attitude: "友善",
          dialogue: "欢迎来到这里，你终于来了。我已经等了你很久了，跟我来吧。",
          hiddenIntent: "引导主角进入陷阱以获取其灵魂能量",
        },
      ],
      choices: [
        { id: "choice_a", label: "跟随向导深入", intent: "跟随神秘向导推进探索深处", risk: "high", route: "act", preview: "你决定跟随向导，走向黑暗深处...", stateEffects: { courage: 3 } },
        { id: "choice_b", label: "独自探索房间", intent: "自己仔细检查房间里的线索", risk: "medium", route: "investigate", preview: "你转身走向桌上的信件...", stateEffects: { caution: 2 } },
        { id: "choice_c", label: "询问更多信息", intent: "向向导了解更多关于这个地方的信息", risk: "low", route: "social", preview: "你停下来，决定先问清楚...", stateEffects: { knowledge: -1 } },
      ],
      bgmCue: {
        mood: "mysterious",
        bpm: 75,
        instruments: ["piano", "strings"],
        loopSeconds: 32,
        sfx: ["creak"],
        musicPrompt: "A mysterious ambient piece with piano and strings",
      },
      artPrompt: {
        prompt: "A dark mysterious room with flickering candlelight, old furniture, yellowed letter on table, shadows on walls, gothic atmosphere, cinematic lighting",
        negativePrompt: "bright, modern, clean",
        aspectRatio: "16:9",
        styleLock: "dark gothic interior",
        seedHint: 42,
      },
      chapterGoal: "找到房间的秘密并决定是否信任神秘向导的指引",
      memorySummary: "你进入了一间神秘房间，遇到了自称向导的神秘人，房间里有可疑信件",
      ...overrides,
    },
    statePatch: { courage: 1 },
    safety: { rating: "PG-13", contentWarnings: [] },
  };
}

describe("test-prompts regression", () => {
  it("all TEST_PROMPTS are non-empty strings", () => {
    expect(TEST_PROMPTS.length).toBeGreaterThan(0);
    for (const p of TEST_PROMPTS) {
      expect(typeof p).toBe("string");
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it("all TEST_PROMPTS_FIXTURES have valid structure", () => {
    expect(TEST_PROMPTS_FIXTURES.length).toBeGreaterThanOrEqual(20);
    for (const f of TEST_PROMPTS_FIXTURES) {
      expect(f.id).toBeTruthy();
      expect(f.prompt.trim().length).toBeGreaterThan(0);
      expect(["zh-CN", "en-US", "ja-JP"]).toContain(f.language);
      expect(["G", "PG", "PG-13", "R"]).toContain(f.rating);
      expect(["short", "medium", "long"]).toContain(f.lengthPreset);
    }
  });

  it("fixtures cover all required languages", () => {
    const languages = new Set(TEST_PROMPTS_FIXTURES.map((f) => f.language));
    expect(languages.has("zh-CN")).toBe(true);
    expect(languages.has("en-US")).toBe(true);
    expect(languages.has("ja-JP")).toBe(true);
  });

  it("fixtures cover all required ratings", () => {
    const ratings = new Set(TEST_PROMPTS_FIXTURES.map((f) => f.rating));
    expect(ratings.has("G")).toBe(true);
    expect(ratings.has("PG")).toBe(true);
    expect(ratings.has("PG-13")).toBe(true);
    expect(ratings.has("R")).toBe(true);
  });

  it("fixtures cover all required length presets", () => {
    const lengths = new Set(TEST_PROMPTS_FIXTURES.map((f) => f.lengthPreset));
    expect(lengths.has("short")).toBe(true);
    expect(lengths.has("medium")).toBe(true);
    expect(lengths.has("long")).toBe(true);
  });

  it("fixtures cover required genres", () => {
    const genres = new Set(TEST_PROMPTS_FIXTURES.map((f) => f.genre));
    const requiredGenres = ["cyberpunk", "fantasy", "horror", "scifi", "steampunk", "mystery", "school"];
    for (const g of requiredGenres) {
      expect(genres.has(g)).toBe(true);
    }
  });

  it("genre detection works for fixtures with expectedGenre", () => {
    let correct = 0;
    let total = 0;
    for (const f of TEST_PROMPTS_FIXTURES) {
      if (f.expectedGenre) {
        total++;
        const detected = detectGenre(f.prompt);
        if (detected === f.expectedGenre) correct++;
      }
    }
    const accuracy = total > 0 ? correct / total : 1;
    expect(accuracy).toBeGreaterThanOrEqual(0.6);
  });

  it("quality checks work on synthetic narrative data", () => {
    const goodChoices = makeNarrative().scene.choices;

    const simResult = checkChoiceSimilarity(goodChoices);
    expect(simResult.passed).toBe(true);

    const riskResult = checkRiskCoverage(goodChoices);
    expect(riskResult.passed).toBe(true);

    const routeResult = checkRouteCoverage(goodChoices);
    expect(routeResult.passed).toBe(true);

    const mainlineResult = checkMainlineAdvancement(goodChoices);
    expect(mainlineResult.passed).toBe(true);

    const costResult = checkCostExposure(goodChoices);
    expect(costResult.passed).toBe(true);

    const similarChoices = [
      { id: "choice_a", label: "小心前进", intent: "carefully go forward", risk: "low" as const, preview: "你小心地向前走去...", stateEffects: {} },
      { id: "choice_b", label: "小心地前进", intent: "carefully go ahead", risk: "low" as const, preview: "你小心地往前走...", stateEffects: {} },
      { id: "choice_c", label: "大胆行动", intent: "act boldly", risk: "high" as const, preview: "你大胆地采取行动...", stateEffects: {} },
    ];

    const simFail = checkChoiceSimilarity(similarChoices);
    expect(simFail.passed).toBe(false);
    expect(simFail.issues.length).toBeGreaterThan(0);

    const riskFail = checkRiskCoverage([
      { id: "choice_a", label: "安全选择", intent: "take the safe path", risk: "low" as const, preview: "你选择安全的路...", stateEffects: {} },
      { id: "choice_b", label: "中等选择", intent: "take the moderate path", risk: "medium" as const, preview: "你选择中间的路...", stateEffects: {} },
    ]);
    expect(riskFail.passed).toBe(false);
  });

  it("NPC count check rejects excessive NPCs", () => {
    const narrative = makeNarrative({
      npcs: Array.from({ length: 5 }, (_, i) => ({
        id: `npc_${i}`,
        name: `NPC ${i}`,
        role: "村民",
        attitude: "中立",
        dialogue: "你好，欢迎来到我们的村庄，有什么需要帮助的吗？",
        hiddenIntent: "观察外来者的一举一动并汇报给首领",
      })),
    });

    const npcResult = checkNpcCount(narrative);
    expect(npcResult.passed).toBe(false);
  });

  it("chapter progression check warns at high turns", () => {
    const narrative = makeNarrative();
    const result = checkChapterProgression(8, narrative);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes("结局"))).toBe(true);
  });

  it("NarrativeOutputSchema validates a complete valid object", () => {
    const valid = makeNarrative();
    const result = NarrativeOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("runAllQualityChecks aggregates all checks", () => {
    const narrative = makeNarrative();
    const result = runAllQualityChecks(narrative, ["神秘房间"], 1);
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.shouldRetry).toBe("boolean");
  });

  it("initMetrics creates valid empty metrics", () => {
    const metrics = initMetrics();
    expect(metrics.totalTests).toBe(0);
    expect(metrics.schemaPassRate).toBe(0);
    expect(metrics.qualityPassRate).toBe(0);
    expect(Object.keys(metrics.byLanguage)).toHaveLength(0);
    expect(Object.keys(metrics.byRating)).toHaveLength(0);
    expect(Object.keys(metrics.byLength)).toHaveLength(0);
  });

  it("regression metrics can be computed from fixtures", () => {
    const metrics: RegressionMetrics = initMetrics();
    metrics.totalTests = TEST_PROMPTS_FIXTURES.length;

    for (const f of TEST_PROMPTS_FIXTURES) {
      if (!metrics.byLanguage[f.language]) metrics.byLanguage[f.language] = { total: 0, passed: 0 };
      metrics.byLanguage[f.language].total++;

      if (!metrics.byRating[f.rating]) metrics.byRating[f.rating] = { total: 0, passed: 0 };
      metrics.byRating[f.rating].total++;

      if (!metrics.byLength[f.lengthPreset]) metrics.byLength[f.lengthPreset] = { total: 0, passed: 0 };
      metrics.byLength[f.lengthPreset].total++;
    }

    expect(metrics.totalTests).toBe(TEST_PROMPTS_FIXTURES.length);
    expect(metrics.byLanguage["zh-CN"].total).toBeGreaterThan(0);
    expect(metrics.byLanguage["en-US"].total).toBeGreaterThan(0);
    expect(metrics.byLanguage["ja-JP"].total).toBeGreaterThan(0);
    expect(metrics.byRating["G"].total).toBeGreaterThan(0);
    expect(metrics.byRating["R"].total).toBeGreaterThan(0);
    expect(metrics.byLength["short"].total).toBeGreaterThan(0);
    expect(metrics.byLength["long"].total).toBeGreaterThan(0);
  });
});
