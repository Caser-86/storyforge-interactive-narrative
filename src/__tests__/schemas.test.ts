import { describe, it, expect } from "vitest";
import { NarrativeOutputSchema } from "@/lib/schemas";

const validScene = {
  title: "暗影森林深处",
  location: "被遗忘的暗影森林核心区域",
  timeOfDay: "午夜时分",
  mood: ["紧张", "神秘", "压抑"],
  body: "你小心翼翼地穿过茂密的荆棘丛，月光几乎无法穿透厚重的树冠。空气中弥漫着腐朽的气息，远处传来若有若无的低语声。你的手电筒光线在浓雾中只能照亮前方几步的距离，每一步都踩在松软的落叶上发出细微的沙沙声。突然，一道微弱的蓝光从树丛深处闪烁了一下，随即消失在黑暗之中。你的心跳加速，直觉告诉你那道光绝非自然现象。脚下的泥土变得湿润，空气中多了一丝铁锈的味道。你握紧了手中的武器，在黑暗与光明的边界上犹豫不决。",
  npcs: [
    {
      id: "npc_forest_spirit",
      name: "森林守望者",
      role: "古老的森林守护精灵",
      attitude: "警惕但非敌意",
      dialogue: "你不该来到这里，外来者。这片森林已经沉睡了千年，你的脚步正在唤醒不该被唤醒的东西。但既然你已经来了，我必须警告你——前方的道路并非只有一条。",
      hiddenIntent: "试图引导旅人离开危险区域，同时测试其意志力",
    },
  ],
  choices: [
    {
      id: "choice_a",
      label: "追随蓝光深入森林",
      intent: "追踪神秘蓝光，探索森林深处的秘密",
      risk: "high" as const,
      preview: "你决定跟随那道神秘的蓝光，向森林更深处走去",
      stateEffects: { tension: 10, danger_level: 5 },
    },
    {
      id: "choice_b",
      label: "与守望者交谈",
      intent: "向森林守望者询问更多关于这片森林的信息",
      risk: "medium" as const,
      preview: "你停下脚步，转向森林守望者寻求指引",
      stateEffects: { tension: -5, knowledge: 10 },
    },
    {
      id: "choice_c",
      label: "原路返回寻找营地",
      intent: "放弃探索，安全返回营地重新规划路线",
      risk: "low" as const,
      preview: "你决定不再冒险，转身沿来时的路返回",
      stateEffects: { tension: -10, safety: 5 },
    },
  ],
  artPrompt: {
    prompt: "A dark ancient forest at midnight, thick canopy blocking moonlight, mysterious blue glow emanating from deep within the trees, fog rolling between gnarled trunks, a solitary figure with a flashlight, eerie atmosphere, dark fantasy style, cinematic lighting",
    negativePrompt: "text, watermark, bright colors, cartoon style, low quality",
    styleLock: "dark fantasy cinematic",
    aspectRatio: "16:9" as const,
    seedHint: 12345,
  },
  bgmCue: {
    mood: "mysterious and tense forest atmosphere",
    bpm: 72,
    instruments: ["cello", "ambient pads", "wind chimes"],
    loopSeconds: 32,
    sfx: ["distant whispers", "rustling leaves"],
    musicPrompt: "Dark ambient forest soundscape with mysterious cello melody and ethereal vocal pads",
  },
  memorySummary: "旅人进入暗影森林，遇到森林守望者并发现神秘蓝光信号",
  chapterGoal: "探索暗影森林的秘密，决定是否追随蓝光或寻求守望者帮助",
};

const validNarrative = {
  scene: validScene,
  statePatch: {},
  safety: {
    rating: "PG-13" as const,
    contentWarnings: [],
  },
};

describe("NarrativeOutputSchema", () => {
  it("accepts valid narrative output", () => {
    const result = NarrativeOutputSchema.safeParse(validNarrative);
    if (!result.success) {
      console.error("Validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("rejects output without 3 choices", () => {
    const bad = {
      ...validNarrative,
      scene: { ...validScene, choices: [validScene.choices[0]] },
    };
    const result = NarrativeOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects output with invalid risk level", () => {
    const bad = {
      ...validNarrative,
      scene: {
        ...validScene,
        choices: validScene.choices.map((c) => ({ ...c, risk: "extreme" })),
      },
    };
    const result = NarrativeOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects output missing required fields", () => {
    const { title: _title, ...noTitle } = validScene;
    const bad = {
      ...validNarrative,
      scene: noTitle,
    };
    const result = NarrativeOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts empty content warnings", () => {
    const result = NarrativeOutputSchema.safeParse(validNarrative);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.safety.contentWarnings).toEqual([]);
    }
  });
});
