import { describe, expect, it } from "vitest";
import { mergeStoryMemory, storyMemoryForPrompt, type StoryMemory } from "@/lib/interactive/story-memory";

describe("interactive story memory", () => {
  it("keeps mainline facts while bounding recent detail", () => {
    const initial: StoryMemory = {
      mainlineFacts: [{ id: "fact-door", content: "门只会在雨夜出现。", immutable: true }],
      plotThreads: [],
      recentSummaries: [],
    };
    const memory = mergeStoryMemory(initial, {
      mainlineFacts: Array.from({ length: 30 }, (_, index) => ({ id: `fact-${index}`, content: `事实 ${index}`, immutable: false })),
      plotThreads: [],
      resolvedThreadIds: [],
      recentSummary: "最后一幕留下了新的线索。",
    });

    expect(memory.mainlineFacts.find((fact) => fact.id === "fact-door")).toBeDefined();
    expect(memory.mainlineFacts.length).toBeLessThanOrEqual(20);
    expect(memory.recentSummaries).toHaveLength(1);
  });

  it("does not overflow when immutable facts fill the entire bound", () => {
    const initial: StoryMemory = {
      mainlineFacts: Array.from({ length: 20 }, (_, index) => ({
        id: `immutable-${index}`,
        content: `不可变事实 ${index}`,
        immutable: true,
      })),
      plotThreads: [],
      recentSummaries: [],
    };

    const memory = mergeStoryMemory(initial, {
      mainlineFacts: [{ id: "mutable-overflow", content: "近期细节", immutable: false }],
      plotThreads: [],
      resolvedThreadIds: [],
    });

    expect(memory.mainlineFacts).toHaveLength(20);
    expect(memory.mainlineFacts.every((fact) => fact.immutable)).toBe(true);
  });

  it("merges a thread idempotently and resolves it by stable id", () => {
    const patch = {
      mainlineFacts: [],
      plotThreads: [{ id: "thread-archive", summary: "档案室在隐藏一份记录。", priority: "high" as const, status: "open" as const }],
      resolvedThreadIds: [],
      recentSummary: "发现档案室的入口。",
    };
    const once = mergeStoryMemory(null, patch);
    const twice = mergeStoryMemory(once, patch);
    const resolved = mergeStoryMemory(twice, { ...patch, plotThreads: [], resolvedThreadIds: ["thread-archive"] });

    expect(twice.plotThreads).toHaveLength(1);
    expect(resolved.plotThreads[0]).toMatchObject({ id: "thread-archive", status: "resolved" });
  });

  it("retains unresolved high-priority threads when lower-priority threads overflow the bound", () => {
    const initial: StoryMemory = {
      mainlineFacts: [],
      plotThreads: [{ id: "thread-critical", summary: "必须回收的核心伏笔", priority: "high", status: "open" }],
      recentSummaries: [],
    };
    const memory = mergeStoryMemory(initial, {
      mainlineFacts: [],
      plotThreads: Array.from({ length: 24 }, (_, index) => ({
        id: `thread-low-${index}`,
        summary: `低优先级伏笔 ${index}`,
        priority: "low" as const,
        status: "open" as const,
      })),
      resolvedThreadIds: [],
    });

    expect(memory.plotThreads.find((thread) => thread.id === "thread-critical")).toMatchObject({ priority: "high", status: "open" });
  });

  it("keeps the prompt representation bounded and prioritizes unresolved high-priority threads", () => {
    const memory = mergeStoryMemory(null, {
      mainlineFacts: Array.from({ length: 20 }, (_, index) => ({ id: `fact-${index}`, content: `主线事实 ${index}`, immutable: true })),
      plotThreads: [
        { id: "thread-low", summary: "低优先级旁支", priority: "low", status: "open" },
        { id: "thread-high", summary: "必须回收的核心伏笔", priority: "high", status: "open" },
      ],
      resolvedThreadIds: [],
      recentSummary: "近期摘要",
    });

    const prompt = storyMemoryForPrompt(memory);
    expect(prompt.indexOf("必须回收的核心伏笔")).toBeGreaterThanOrEqual(0);
    expect(prompt.length).toBeLessThan(5000);
  });
});
