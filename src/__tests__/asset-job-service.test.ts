import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetJobData } from "@/lib/asset-queue";

const mockQuery = vi.fn();
const mockEnqueueAssetJob = vi.fn();

vi.mock("@/lib/db", () => ({
  query: mockQuery,
}));

vi.mock("@/lib/asset-queue", () => ({
  enqueueAssetJob: mockEnqueueAssetJob,
}));

const job: AssetJobData = {
  assetJobId: "asset_1",
  sessionId: "sess_1",
  sceneId: "scene_1",
  promptJson: {
    prompt: "forest",
    negativePrompt: "",
    aspectRatio: "16:9",
    seedHint: 1,
    styleLock: "cinematic",
  },
  provider: "mock",
};

describe("enqueueAssetJobWithFailureMark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], duration: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the asset job failed when the queue reports unavailable", async () => {
    mockEnqueueAssetJob.mockResolvedValue({ queued: false, reason: "Redis not available" });

    const { enqueueAssetJobWithFailureMark } = await import("@/lib/asset-job-service");
    const result = await enqueueAssetJobWithFailureMark(job);

    expect(result).toEqual({ queued: false, reason: "Redis not available" });
    expect(mockQuery).toHaveBeenCalledWith(
      "UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2",
      ["Worker unavailable: Redis not available", "asset_1"]
    );
  });

  it("marks the asset job failed when enqueue throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockEnqueueAssetJob.mockRejectedValue(new Error("boom"));

    const { enqueueAssetJobWithFailureMark } = await import("@/lib/asset-job-service");
    const result = await enqueueAssetJobWithFailureMark(job);

    expect(result).toEqual({ queued: false, reason: "boom" });
    expect(console.warn).toHaveBeenCalledWith("Failed to enqueue asset job:", "boom");
    expect(mockQuery).toHaveBeenCalledWith(
      "UPDATE asset_jobs SET status = 'failed', error = $1 WHERE id = $2",
      ["Worker unavailable: boom", "asset_1"]
    );
  });

  it("can treat failure-mark updates as best effort", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockEnqueueAssetJob.mockResolvedValue({ queued: false, reason: "Redis not available" });
    mockQuery.mockRejectedValue(new Error("db down"));

    const { enqueueAssetJobWithFailureMark } = await import("@/lib/asset-job-service");
    const result = await enqueueAssetJobWithFailureMark(job, { failureUpdate: "warn" });

    expect(result).toEqual({ queued: false, reason: "Redis not available" });
    expect(console.warn).toHaveBeenCalledWith("Failed to mark asset job unavailable:", "db down");
  });
});
