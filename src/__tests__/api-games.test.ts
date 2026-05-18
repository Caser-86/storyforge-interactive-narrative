import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  initDb: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(async (callback: (tx: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const mockTx = {
      query: vi.fn().mockResolvedValue({ rows: [], duration: 1 }),
    };
    return callback(mockTx);
  }),
}));

vi.mock("@/lib/narrative-service", () => ({
  generateNarrative: vi.fn().mockResolvedValue({
    data: {
      scene: {
        title: "测试场景标题",
        location: "测试地点",
        timeOfDay: "夜晚",
        mood: ["紧张", "神秘"],
        body: "你小心翼翼地穿过茂密的荆棘丛，月光几乎无法穿透厚重的树冠。空气中弥漫着腐朽的气息，远处传来若有若无的低语声。你的手电筒光线在浓雾中只能照亮前方几步的距离，每一步都踩在松软的落叶上发出细微的沙沙声。突然，一道微弱的蓝光从树丛深处闪烁了一下，随即消失在黑暗之中。你的心跳加速，直觉告诉你那道光绝非自然现象。脚下的泥土变得湿润，空气中多了一丝铁锈的味道。",
        npcs: [],
        choices: [
          { id: "a", label: "选项A", intent: "前进", risk: "low", preview: "你向前走去", stateEffects: { tension: 5 } },
          { id: "b", label: "选项B", intent: "后退", risk: "medium", preview: "你向后退去", stateEffects: { tension: -5 } },
          { id: "c", label: "选项C", intent: "等待", risk: "high", preview: "你原地不动", stateEffects: { danger_level: 10 } },
        ],
        artPrompt: { prompt: "a dark forest", negativePrompt: "text", styleLock: "dark fantasy", aspectRatio: "16:9", seedHint: 1 },
        bgmCue: { mood: "suspense", bpm: 90, instruments: ["strings"], musicPrompt: "suspenseful" },
        memorySummary: "测试记忆",
        chapterGoal: "测试目标",
      },
      statePatch: {},
      safety: { rating: "PG-13", contentWarnings: [] },
    },
    latencyMs: 100,
  }),
  generateFallbackNarrative: vi.fn().mockReturnValue({
    scene: {
      title: "回退场景",
      location: "回退地点——一片宁静的荒野",
      timeOfDay: "白天",
      mood: ["平静", "安宁"],
      body: "回退叙事内容，这是一段足够长的回退叙事文本，用于在主LLM服务不可用时提供基本的游戏体验。这段文本需要满足最小长度要求以确保叙事质量。你站在一片开阔的荒野之上，微风轻拂，远处有鸟鸣声传来。虽然环境平和，但你知道必须继续前行。",
      npcs: [
        { id: "npc_guide", name: "向导", role: "引路人", attitude: "友善", dialogue: "这条路虽然安全，但前方还有很长的路要走，请做好准备。", hiddenIntent: "默默守护旅人的安全，确保不迷失方向" },
      ],
      choices: [
        { id: "choice_a", label: "继续前进探索", intent: "沿着道路继续前行，寻找新的发现", risk: "low", preview: "前方的道路看起来安全但漫长", stateEffects: { progress: 5 } },
        { id: "choice_b", label: "停下来休息观察", intent: "在原地休息片刻，观察周围环境", risk: "medium", preview: "休息可以恢复体力，但可能错过时机", stateEffects: { rest: 3 } },
        { id: "choice_c", label: "转向小路冒险", intent: "离开主路，探索未知的小径", risk: "high", preview: "小路通向未知，充满危险与机遇", stateEffects: { adventure: 5, danger: 3 } },
      ],
      artPrompt: { prompt: "a safe peaceful wilderness scene with gentle breeze and birds, atmospheric digital art style, wide landscape view, soft lighting", negativePrompt: "text", styleLock: "general", aspectRatio: "16:9" as const, seedHint: 1 },
      bgmCue: { mood: "calm", bpm: 60, instruments: ["piano", "flute"], musicPrompt: "calm peaceful wilderness ambient piano flute", loopSeconds: 32 as const, sfx: [] },
      memorySummary: "主角在宁静荒野中遇到向导，面临继续前进或探索的选择",
      chapterGoal: "安全穿越荒野，找到下一个重要的目的地",
    },
    statePatch: {},
    safety: { rating: "PG" as const, contentWarnings: [] },
  }),
}));

vi.mock("@/lib/asset-queue", () => ({
  enqueueAssetJob: vi.fn(),
}));

import { query } from "@/lib/db";
import { POST } from "@/app/api/games/route";

function mockRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO game_sessions")) {
        return { rows: [], duration: 1 };
      }
      if (sql.includes("INSERT INTO scenes")) {
        return { rows: [], duration: 1 };
      }
      if (sql.includes("INSERT INTO choices")) {
        return { rows: [], duration: 1 };
      }
      if (sql.includes("INSERT INTO asset_jobs")) {
        return { rows: [], duration: 1 };
      }
      return { rows: [], duration: 0 };
    });
  });

  it("returns 400 when prompt is missing", async () => {
    const req = mockRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
  });

  it("returns 400 when prompt is empty string", async () => {
    const req = mockRequest({ prompt: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsafe input", async () => {
    const req = mockRequest({ prompt: "我想看自残的内容" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates session with valid prompt", async () => {
    const req = mockRequest({ prompt: "一个勇敢的冒险者走进了神秘森林" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.sessionId).toMatch(/^sess_/);
    expect(body.scene).toBeDefined();
    expect(body.assets).toBeDefined();
    expect(body.assets.imageJobId).toMatch(/^asset_/);
    expect(body.timing).toBeDefined();
    expect(body.meta).toBeDefined();
  });

  it("includes meta.usedFallback when LLM fails", async () => {
    const req = mockRequest({ prompt: "一个赛博朋克城市" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toHaveProperty("usedFallback");
    expect(typeof body.meta.usedFallback).toBe("boolean");
  });
});
