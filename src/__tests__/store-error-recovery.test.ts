import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useGameStore } from "@/lib/store";

const MOCK_SCENE = {
  id: "scene_1",
  title: "测试场景",
  location: "测试地点",
  timeOfDay: "夜晚",
  mood: ["紧张"],
  body: "你站在一片神秘的森林中，四周弥漫着浓雾。远处传来低沉的咆哮声，你的心跳加速。树木之间闪烁着微弱的蓝光，似乎有什么东西在注视着你。你必须做出选择。",
  npcs: [],
  choices: [
    { id: "a", label: "小心前进", intent: "谨慎探索", risk: "low", preview: "你小心翼翼地前进", stateEffects: { caution: 2 } },
    { id: "b", label: "直接冲锋", intent: "勇敢突击", risk: "medium", preview: "你勇敢地冲向声音来源", stateEffects: { courage: 3 } },
    { id: "c", label: "与声音对话", intent: "尝试交流", risk: "high", preview: "你大声询问是谁在那里", stateEffects: { charisma: 2 } },
  ],
  artPrompt: { prompt: "a dark forest", negativePrompt: "text", styleLock: "dark", aspectRatio: "16:9", seedHint: 1 },
  bgmCue: { mood: "suspense", bpm: 90, instruments: ["strings"], musicPrompt: "suspenseful" },
  chapterGoal: "探索森林",
  memorySummary: "主角进入神秘森林",
};

const MOCK_CREATE_RESPONSE = {
  sessionId: "sess_test",
  ownerToken: "owner_token_123",
  scene: MOCK_SCENE,
  safety: { rating: "PG-13", contentWarnings: [] },
  assets: { imageJobId: null, imageStatus: "none" },
  timing: { llmMs: 1000, totalMs: 2000 },
};

const MOCK_CHOICE_RESPONSE = {
  scene: { ...MOCK_SCENE, id: "scene_2", title: "第二幕" },
  stateDiff: { tension: 5 },
  safety: { rating: "PG-13", contentWarnings: [] },
  assets: { imageJobId: null, imageStatus: "none" },
  timing: { llmMs: 800, totalMs: 1500 },
};

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
  };
}

describe("Store: error recovery", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useGameStore.getState().reset();
  });

  it("createGame failure sets error state with lastAction", async () => {
    mockFetch.mockRejectedValueOnce(new Error("LLM 服务不可用"));

    await useGameStore.getState().createGame("测试故事");

    const state = useGameStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("LLM 服务不可用");
    expect(state.lastAction).toEqual({
      type: "create",
      prompt: "测试故事",
      language: "zh-CN",
      rating: "PG-13",
      options: {},
    });
  });

  it("retryLast retries createGame after failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("网络错误"));
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");
    expect(useGameStore.getState().status).toBe("error");

    await useGameStore.getState().retryLast();

    const state = useGameStore.getState();
    expect(state.status).toBe("playing");
    expect(state.sessionId).toBe("sess_test");
    expect(state.currentScene?.title).toBe("测试场景");
  });

  it("makeChoice failure sets error state with lastAction", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");
    expect(useGameStore.getState().status).toBe("playing");

    mockFetch.mockRejectedValueOnce(new Error("选择处理失败"));

    await useGameStore.getState().makeChoice("scene_1", "a");

    const state = useGameStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("选择处理失败");
    expect(state.lastAction).toEqual({
      type: "choice",
      sceneId: "scene_1",
      choiceId: "a",
    });
  });

  it("retryLast retries makeChoice after failure", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");

    mockFetch.mockRejectedValueOnce(new Error("临时错误"));
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CHOICE_RESPONSE));

    await useGameStore.getState().makeChoice("scene_1", "a");
    expect(useGameStore.getState().status).toBe("error");

    await useGameStore.getState().retryLast();

    const state = useGameStore.getState();
    expect(state.status).toBe("playing");
    expect(state.currentScene?.id).toBe("scene_2");
  });

  it("retryLast does nothing when no lastAction", async () => {
    const stateBefore = useGameStore.getState().status;
    await useGameStore.getState().retryLast();
    expect(useGameStore.getState().status).toBe(stateBefore);
  });

  it("HTTP 500 error sets error state with traceId", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: "Internal Server Error", traceId: "trace_abc123" }, 500)
    );

    await useGameStore.getState().createGame("测试故事");

    const state = useGameStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("Internal Server Error");
    expect(state.errorTraceId).toBe("trace_abc123");
  });

  it("retryLast clears errorMessage before retrying", async () => {
    mockFetch.mockRejectedValueOnce(new Error("首次失败"));
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");
    expect(useGameStore.getState().errorMessage).toBeTruthy();

    const retryPromise = useGameStore.getState().retryLast();
    expect(useGameStore.getState().errorMessage).toBeNull();
    expect(useGameStore.getState().status).toBe("generating");

    await retryPromise;
    expect(useGameStore.getState().status).toBe("playing");
  });
});

describe("Store: session persistence", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useGameStore.getState().reset();
  });

  it("reset clears sessionId and ownerToken", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");
    expect(useGameStore.getState().sessionId).toBe("sess_test");

    useGameStore.getState().reset();

    expect(useGameStore.getState().sessionId).toBeNull();
    expect(useGameStore.getState().ownerToken).toBeNull();
    expect(useGameStore.getState().status).toBe("idle");
  });

  it("history accumulates across choices", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");

    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CHOICE_RESPONSE));

    await useGameStore.getState().makeChoice("scene_1", "a");

    const state = useGameStore.getState();
    expect(state.history).toHaveLength(2);
    expect(state.history[0].choiceLabel).toBe("小心前进");
    expect(state.history[1].title).toBe("第二幕");
  });

  it("createGame then makeChoice preserves full state chain", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CREATE_RESPONSE));

    await useGameStore.getState().createGame("测试故事");
    expect(useGameStore.getState().currentScene?.id).toBe("scene_1");

    mockFetch.mockResolvedValueOnce(mockJsonResponse(MOCK_CHOICE_RESPONSE));

    await useGameStore.getState().makeChoice("scene_1", "a");
    expect(useGameStore.getState().currentScene?.id).toBe("scene_2");
    expect(useGameStore.getState().stateDiff).toEqual({ tension: 5 });
  });
});
