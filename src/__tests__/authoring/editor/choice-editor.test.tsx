// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryEdge } from "@/lib/authoring/schemas";
import { ChoiceEditor } from "@/features/authoring/editor/choice-editor";

const api = vi.hoisted(() => ({ patchEdge: vi.fn() }));
vi.mock("@/features/authoring/authoring-api", () => api);

const edge: StoryEdge = {
  id: "edge-1",
  versionId: "version-1",
  sourceNodeId: "node-1",
  targetNodeId: "node-2",
  label: "旧选择",
  intent: "旧意图",
  consequenceSummary: "旧结果",
  branchType: "main",
  sortOrder: 0,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

describe("ChoiceEditor", () => {
  beforeEach(() => api.patchEdge.mockReset());
  afterEach(() => vi.useRealTimers());

  it("preserves newer choice text while an earlier save is still in flight", async () => {
    vi.useFakeTimers();
    let resolveFirstSave!: (value: { edge: StoryEdge; draftRevision: number }) => void;
    let resolveSecondSave!: (value: { edge: StoryEdge; draftRevision: number }) => void;
    const firstSave = new Promise<{ edge: StoryEdge; draftRevision: number }>((resolve) => { resolveFirstSave = resolve; });
    const secondSave = new Promise<{ edge: StoryEdge; draftRevision: number }>((resolve) => { resolveSecondSave = resolve; });
    api.patchEdge.mockReturnValueOnce(firstSave).mockReturnValueOnce(secondSave);
    render(<ChoiceEditor projectId="project-1" edge={edge} expectedRevision={4} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("选择文案"), { target: { value: "第一次选择" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText("选择文案"), { target: { value: "第二次选择" } });

    resolveFirstSave({ edge: { ...edge, label: "第一次选择" }, draftRevision: 5 });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByLabelText("选择文案")).toHaveValue("第二次选择");

    resolveSecondSave({ edge: { ...edge, label: "第二次选择" }, draftRevision: 6 });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  });
});
