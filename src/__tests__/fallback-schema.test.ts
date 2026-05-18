import { describe, it, expect } from "vitest";
import { NarrativeOutputSchema } from "@/lib/schemas";

const FALLBACK_NARRATIVE = {
  scene: {
    title: "迷雾中的岔路",
    location: "未知之地——被永恒迷雾笼罩的荒原尽头",
    timeOfDay: "黄昏",
    mood: ["神秘", "紧张"],
    body: "你站在一片浓重的迷雾之中，四周灰蒙蒙的，完全看不清方向。脚下的泥土湿润而冰冷，空气中弥漫着一股古老而腐朽的气息，仿佛这片荒原已经沉睡了千年之久。远处隐约传来低沉的回响，但无法辨别来源。前方出现了两条截然不同的路——左边隐约透出微弱的暖光，右边则通向更加深沉的黑暗。迷雾在你身边缓缓流动，仿佛有生命一般。远处传来若有若无的低语声，似乎在召唤你做出选择。你紧握手中的行囊，心跳加速，知道自己必须迈出下一步，因为留在这里只会让迷雾越来越浓。",
    npcs: [
      {
        id: "npc_mysterious_voice",
        name: "神秘声音",
        role: "引导者",
        attitude: "中立",
        dialogue: "选择你的路吧，旅人。每条路都有代价，也有回报。",
        hiddenIntent: "测试旅人的决心与智慧，观察其面对未知时的抉择",
      },
    ],
    choices: [
      {
        id: "choice_a",
        label: "走向光芒的方向",
        intent: "追寻远处微弱的暖光，寻找安全与希望",
        risk: "low",
        preview: "微弱的光芒可能意味着安全，也可能是一个陷阱",
        stateEffects: { hope: 5 },
      },
      {
        id: "choice_b",
        label: "踏入黑暗深处",
        intent: "勇敢探索未知的黑暗，寻找隐藏的真相",
        risk: "medium",
        preview: "黑暗中或许藏着真相，但危险同样潜伏其中",
        stateEffects: { courage: 5 },
      },
      {
        id: "choice_c",
        label: "原地等待观察",
        intent: "耐心等待局势变化，观察迷雾是否会自行散去",
        risk: "high",
        preview: "迷雾或许会自行散去，但等待也可能招致更大的危险",
        stateEffects: { patience: 3, anxiety: 5 },
      },
    ],
    artPrompt: {
      prompt: "foggy crossroads at dusk with two diverging paths, one glowing warm light left side, dark ominous path right side, mysterious hooded figure in distance, cinematic atmospheric lighting, digital painting style",
      negativePrompt: "text, watermark, blurry, low quality, deformed",
      styleLock: "atmospheric digital art with cinematic composition",
      aspectRatio: "16:9" as const,
      seedHint: 12345,
    },
    bgmCue: {
      mood: "mysterious and tense atmospheric exploration",
      bpm: 72,
      instruments: ["strings", "piano", "ambient_pad"],
      loopSeconds: 32 as const,
      musicPrompt: "ambient mysterious fog exploration strings piano slow atmospheric tension building",
      sfx: ["wind", "distant_echo"],
    },
    memorySummary: "主角在迷雾笼罩的荒原中面临岔路选择，神秘声音引导其做出抉择",
    chapterGoal: "在迷雾中找到前进的方向，揭开荒原深处的秘密",
  },
  statePatch: {},
  safety: { rating: "PG-13" as const, contentWarnings: [] },
};

describe("Fallback narrative schema compliance", () => {
  it("passes NarrativeOutputSchema validation", () => {
    const result = NarrativeOutputSchema.safeParse(FALLBACK_NARRATIVE);
    expect(result.success).toBe(true);
  });

  it("has exactly 3 choices", () => {
    expect(FALLBACK_NARRATIVE.scene.choices).toHaveLength(3);
  });

  it("covers low/medium/high risk levels", () => {
    const risks = FALLBACK_NARRATIVE.scene.choices.map((c) => c.risk);
    expect(risks).toContain("low");
    expect(risks).toContain("medium");
    expect(risks).toContain("high");
  });

  it("has at least one NPC", () => {
    expect(FALLBACK_NARRATIVE.scene.npcs.length).toBeGreaterThanOrEqual(1);
  });

  it("has body text meeting minimum length", () => {
    expect(FALLBACK_NARRATIVE.scene.body.length).toBeGreaterThanOrEqual(180);
  });

  it("has valid artPrompt with styleLock", () => {
    expect(FALLBACK_NARRATIVE.scene.artPrompt.styleLock).toBeTruthy();
    expect(FALLBACK_NARRATIVE.scene.artPrompt.prompt.length).toBeGreaterThanOrEqual(60);
  });

  it("has valid bgmCue with minimum instruments", () => {
    expect(FALLBACK_NARRATIVE.scene.bgmCue.mood).toBeTruthy();
    expect(FALLBACK_NARRATIVE.scene.bgmCue.instruments.length).toBeGreaterThanOrEqual(2);
  });

  it("safety rating is PG-13 or lower", () => {
    expect(["G", "PG", "PG-13"]).toContain(FALLBACK_NARRATIVE.safety.rating);
  });
});
