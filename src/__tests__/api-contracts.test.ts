import { describe, it, expect } from "vitest";
import {
  CreateGameResponseSchema,
  ChoiceResponseSchema,
  ExportResponseSchema,
  ShareReplayResponseSchema,
  GetSessionResponseSchema,
} from "@/lib/api-contracts";

describe("api-contracts", () => {
  const longArtPrompt = "cinematic interactive narrative scene, moonlit ancient library, detailed environment, dramatic lighting, high quality concept art";

  const validScene = {
    id: "scene_1",
    title: "测试场景",
    location: "测试地点",
    timeOfDay: "深夜",
    mood: ["紧张", "神秘"],
    body: "玩家站在一座被雨水浸透的旧图书馆门前，门缝里透出冷白色的光。地面上的脚印从街角一路延伸到门内，却没有任何返回的痕迹。空气里混着纸张、铁锈和潮湿木头的气味，远处钟楼刚好敲响第十二下。你意识到，今晚的选择会决定这座城市隐藏多年的秘密是否会被揭开。",
    npcs: [{
      id: "npc_guide",
      name: "林博士",
      role: "向导",
      attitude: "谨慎",
      dialogue: "别碰书架上的红色索引，那不是目录，而是某种记录活人记忆的装置。",
      hiddenIntent: "她知道图书馆真正的入口，却想先确认玩家是否值得信任",
    }],
    choices: [{
      id: "choice_scene1_choice_a",
      modelChoiceId: "choice_a",
      label: "查看红色索引",
      intent: "冒险翻开红色索引，确认它记录了哪些失踪者的记忆",
      risk: "low" as const,
      preview: "你会获得关键线索，但可能触发图书馆的警报",
      stateEffects: { clue: 5 },
    }],
    artPrompt: {
      prompt: longArtPrompt,
      negativePrompt: "low quality, blurry, text artifacts",
      aspectRatio: "16:9",
      seedHint: 42,
      styleLock: "cinematic mystery, rain, cold light",
    },
    bgmCue: {
      mood: "mysterious",
      bpm: 72,
      instruments: ["piano", "strings"],
      loopSeconds: 32 as const,
      sfx: ["rain on glass"],
      musicPrompt: "slow mysterious ambient piano and strings loop for investigative narrative",
    },
    chapterGoal: "找到图书馆隐藏入口，并确认失踪者记忆被谁封存",
    memorySummary: "玩家抵达雨夜图书馆，林博士警告红色索引与失踪者记忆有关",
  };

  it("CreateGameResponseSchema validates correct structure", () => {
    const data = {
      sessionId: "sess_1",
      ownerToken: "ot_123",
      scene: validScene,
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_1", imageStatus: "queued" },
      timing: { llmMs: 1000, totalMs: 1200 },
    };

    const result = CreateGameResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CreateGameResponseSchema accepts disabled image generation", () => {
    const data = {
      sessionId: "sess_1",
      ownerToken: "ot_123",
      scene: validScene,
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: null, imageStatus: "none" },
      timing: { llmMs: 1000, totalMs: 1200 },
      meta: { usedFallback: false, llmError: null, imageGenerationEnabled: false },
    };

    const result = CreateGameResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CreateGameResponseSchema rejects missing sessionId", () => {
    const data = {
      scene: validScene,
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_1", imageStatus: "queued" },
    };

    const result = CreateGameResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("ChoiceResponseSchema has same structure as CreateGameResponseSchema", () => {
    const data = {
      sessionId: "sess_1",
      scene: validScene,
      previousChoiceId: "choice_scene1_choice_a",
      stateDiff: { courage: 1 },
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_2", imageStatus: "queued" },
      timing: {},
    };

    const result = ChoiceResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("ExportResponseSchema validates correct structure", () => {
    const data = {
      session: {
        id: "sess_1",
        seedPrompt: "测试提示词",
        genre: "mystery",
        language: "zh-CN",
        rating: "PG-13",
        status: "active",
        state: {},
        createdAt: "2026-05-18T00:00:00Z",
      },
      scenes: [{ ...validScene, turn: 1, createdAt: "2026-05-18T00:00:00Z" }],
      exportedAt: "2026-05-18T00:00:00Z",
    };

    const result = ExportResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("ShareReplayResponseSchema validates correct structure", () => {
    const data = {
      session: {
        seedPrompt: "测试提示词",
        genre: "mystery",
        rating: "PG-13",
      },
      scenes: [{
        turn: 1,
        title: validScene.title,
        location: validScene.location,
        timeOfDay: validScene.timeOfDay,
        mood: validScene.mood,
        body: validScene.body,
        npcs: validScene.npcs,
        chapterGoal: validScene.chapterGoal,
      }],
    };

    const result = ShareReplayResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CreateGameResponseSchema accepts optional meta field", () => {
    const data = {
      sessionId: "sess_1",
      ownerToken: "ot_123",
      scene: validScene,
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_1", imageStatus: "queued" },
      timing: {},
      meta: { usedFallback: true, llmError: "timeout" },
    };

    const result = CreateGameResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CreateGameResponseSchema rejects stale art and bgm contract shapes", () => {
    const data = {
      sessionId: "sess_1",
      ownerToken: "ot_123",
      scene: {
        ...validScene,
        artPrompt: { ...validScene.artPrompt, seedHint: "42" },
        bgmCue: {
          mood: "mysterious",
          tempo: "slow",
          instruments: "piano",
          prompt: "ambient piano",
        },
      },
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_1", imageStatus: "queued" },
      timing: {},
    };

    const result = CreateGameResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("CreateGameResponseSchema must include ownerToken", () => {
    const data = {
      sessionId: "sess_1",
      scene: validScene,
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_1", imageStatus: "queued" },
      timing: {},
    };

    const result = CreateGameResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("ChoiceResponseSchema must have previousChoiceId and stateDiff, not ownerToken", () => {
    const data = {
      sessionId: "sess_1",
      previousChoiceId: "choice_1",
      stateDiff: { courage: 1 },
      scene: validScene,
      safety: { rating: "PG-13", contentWarnings: [] },
      assets: { imageJobId: "job_2", imageStatus: "queued" },
      timing: {},
    };

    const result = ChoiceResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(() => ChoiceResponseSchema.parse({ ...data, ownerToken: "ot_123" })).not.toThrow();
  });

  it("ShareReplayResponseSchema must not return session.id", () => {
    const data = {
      session: {
        id: "sess_1",
        seedPrompt: "测试提示词",
        genre: "mystery",
        rating: "PG-13",
      },
      scenes: [{
        turn: 1,
        title: validScene.title,
        location: validScene.location,
        timeOfDay: validScene.timeOfDay,
        mood: validScene.mood,
        body: validScene.body,
        npcs: validScene.npcs,
        chapterGoal: validScene.chapterGoal,
      }],
    };

    const result = ShareReplayResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("id" in result.data.session).toBe(false);
    }
  });

  it("GetSessionResponseSchema validates correct structure", () => {
    const data = {
      session: {
        id: "sess_1",
        seedPrompt: "测试提示词",
        genre: "mystery",
        language: "zh-CN",
        rating: "PG-13",
        status: "active",
        currentSceneId: "scene_1",
        state: {},
        createdAt: "2026-05-18T00:00:00Z",
        updatedAt: "2026-05-18T00:00:00Z",
      },
      scenes: [{
        ...validScene,
        turn: 1,
        createdAt: "2026-05-18T00:00:00Z",
        choices: validScene.choices.map((c) => ({ ...c, chosen: false })),
      }],
      assets: {
        imageJobId: "job_1",
        imageStatus: "queued",
        imageUrl: null,
      },
    };

    const result = GetSessionResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("GetSessionResponseSchema requires chosen field on choices", () => {
    const data = {
      session: {
        id: "sess_1",
        seedPrompt: "测试提示词",
        genre: "mystery",
        language: "zh-CN",
        rating: "PG-13",
        status: "active",
        currentSceneId: "scene_1",
        state: {},
        createdAt: "2026-05-18T00:00:00Z",
        updatedAt: "2026-05-18T00:00:00Z",
      },
      scenes: [{
        ...validScene,
        turn: 1,
        choices: validScene.choices,
      }],
      assets: {
        imageJobId: "job_1",
        imageStatus: "queued",
        imageUrl: null,
      },
    };

    const result = GetSessionResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
