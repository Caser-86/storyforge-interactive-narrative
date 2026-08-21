// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationRun, GenerationStep } from "@/lib/authoring/generation/schemas";
import { GenerationProgress } from "@/features/authoring/generation-progress";

const push = vi.fn();
const api = vi.hoisted(() => ({
  listGenerationRuns: vi.fn(),
  createGenerationRun: vi.fn(),
  getGenerationStatus: vi.fn(),
  advanceGeneration: vi.fn(),
  generationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/authoring/authoring-api", () => api);

function run(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return {
    id: "run-1",
    projectId: "project-1",
    versionId: "version-1",
    stage: "outline",
    status: "paused",
    progressCurrent: 3,
    progressTotal: 8,
    model: "deepseek-v4-flash",
    inputTokens: 0,
    outputTokens: 0,
    retryCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    leaseExpiresAt: null,
    startedAt: "2026-08-21T00:00:00.000Z",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function statusResponse(currentRun: GenerationRun) {
  return { run: currentRun, steps: [] as GenerationStep[], lastCompletedStep: null };
}

describe("GenerationProgress", () => {
  beforeEach(() => {
    push.mockReset();
    api.listGenerationRuns.mockReset();
    api.createGenerationRun.mockReset();
    api.getGenerationStatus.mockReset();
    api.advanceGeneration.mockReset();
    api.generationAction.mockReset();
    api.listGenerationRuns.mockResolvedValue([run()]);
    api.getGenerationStatus.mockImplementation(async (_projectId: string, _runId: string) => statusResponse(run()));
  });

  it("restores a paused run after reload and exposes its progress", async () => {
    render(<GenerationProgress projectId="project-1" projectTitle="夜航船" />);

    expect(await screen.findByText("生成已暂停")).toBeInTheDocument();
    expect(screen.getByLabelText("3 / 8")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续生成" })).toBeInTheDocument();
  });

  it("explains an authentication pause instead of presenting a false success", async () => {
    const paused = run({ lastErrorCode: "AUTH", lastErrorMessage: "Provider credentials were rejected." });
    api.listGenerationRuns.mockResolvedValue([paused]);
    api.getGenerationStatus.mockResolvedValue(statusResponse(paused));
    render(<GenerationProgress projectId="project-1" projectTitle="夜航船" />);

    expect(await screen.findByText("需要检查模型凭证")).toBeInTheDocument();
    expect(screen.getByText("Provider credentials were rejected.")).toBeInTheDocument();
  });

  it("creates a run when the project has no previous generation", async () => {
    const created = run({ status: "queued", progressCurrent: 0 });
    api.listGenerationRuns.mockResolvedValue([]);
    api.createGenerationRun.mockResolvedValue(created);
    api.getGenerationStatus.mockResolvedValue(statusResponse(created));
    render(<GenerationProgress projectId="project-1" projectTitle="夜航船" />);

    await waitFor(() => expect(api.createGenerationRun).toHaveBeenCalledWith("project-1"));
    expect(await screen.findByText("准备生成")).toBeInTheDocument();
  });

  it("sends an explicit resume action", async () => {
    const user = userEvent.setup();
    const resumed = run({ status: "queued" });
    api.generationAction.mockResolvedValue(resumed);
    render(<GenerationProgress projectId="project-1" projectTitle="夜航船" />);
    await screen.findByText("生成已暂停");
    await user.click(screen.getByRole("button", { name: "继续生成" }));

    await waitFor(() => expect(api.generationAction).toHaveBeenCalledWith("project-1", "run-1", "resume"));
  });

  it("keeps advancing when a completed step leaves the run queued", async () => {
    let current = run({ status: "queued", progressCurrent: 0 });
    api.listGenerationRuns.mockResolvedValue([current]);
    api.getGenerationStatus.mockImplementation(async () => statusResponse(current));
    api.advanceGeneration.mockImplementation(async () => {
      current = api.advanceGeneration.mock.calls.length === 1
        ? run({ status: "queued", progressCurrent: 1 })
        : run({ status: "completed", progressCurrent: 2, progressTotal: 2, stage: "ready", completedAt: "2026-08-21T00:01:00.000Z" });
      return statusResponse(current);
    });

    render(<GenerationProgress projectId="project-1" projectTitle="夜航船" />);

    await waitFor(() => expect(api.advanceGeneration).toHaveBeenCalledTimes(2), { timeout: 2500 });
    expect(await screen.findByText("生成完成")).toBeInTheDocument();
  });
});
