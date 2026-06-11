import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], duration: 1 }),
}));

import { query } from "@/lib/db";
import { persistAssetLog, persistLlmLog } from "@/lib/observability-persist";

describe("observability persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes LLM success as a SQLite-safe number", async () => {
    await persistLlmLog({
      sessionId: "sess_1",
      sceneId: "scene_1",
      model: "deepseek-v4-flash",
      latencyMs: 1200,
      inputTokens: undefined,
      outputTokens: 42,
      retryCount: 0,
      success: true,
      timestamp: "2026-06-01T00:00:00.000Z",
    });

    const params = (query as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[];
    expect(params[4]).toBeNull();
    expect(params[7]).toBe(1);
  });

  it("serializes asset success as a SQLite-safe number", async () => {
    await persistAssetLog({
      assetJobId: "asset_1",
      sessionId: "sess_1",
      sceneId: "scene_1",
      provider: "mock",
      type: "image",
      latencyMs: undefined,
      success: false,
      timestamp: "2026-06-01T00:00:00.000Z",
    });

    const params = (query as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[];
    expect(params[5]).toBeNull();
    expect(params[6]).toBe(0);
  });
});
