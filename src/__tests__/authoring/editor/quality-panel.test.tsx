// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { IssuePanel } from "@/features/authoring/editor/issue-panel";
import { ReleaseChecklist } from "@/features/authoring/editor/release-checklist";
import type { ValidationIssueRecord } from "@/lib/authoring/validation/schemas";

const issue: ValidationIssueRecord = {
  id: "issue-1",
  projectId: "project-1",
  versionId: "version-1",
  runId: "run-1",
  draftRevision: 3,
  source: "rule",
  severity: "warning",
  code: "SIMILAR_CHOICES",
  message: "两个选择过于相似。",
  nodeId: "node-1",
  edgeId: null,
  detailsJson: { evidence: ["选择 A", "选择 B"] },
  fingerprint: "fingerprint-1",
  status: "open",
  createdAt: "2026-08-21T00:00:00.000Z",
  resolvedAt: null,
};

const decision = {
  projectId: "project-1",
  versionId: "version-1",
  currentRevision: 3,
  validationRevision: 3,
  allowed: true,
  generationComplete: true,
  blocking: [],
  warnings: [issue],
};

describe("quality panels", () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(JSON.stringify({ issue: { ...issue, status: "dismissed" } }), { status: 200 });
      if (String(input).endsWith("/validate")) return new Response(JSON.stringify({ ...decision, issues: [issue] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  it("filters, jumps to the node, and dismisses a warning after confirmation", async () => {
    const onSelectNode = vi.fn();
    render(<IssuePanel projectId="project-1" initialIssues={[issue]} onSelectNode={onSelectNode} />);

    expect(await screen.findByText("两个选择过于相似。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "定位到节点" }));
    expect(onSelectNode).toHaveBeenCalledWith("node-1");
    fireEvent.click(screen.getByRole("button", { name: "忽略 warning" }));
    await waitFor(() => expect(screen.queryByText("两个选择过于相似。")).not.toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalled();
  });

  it("shows the current release revision and re-runs deterministic validation", async () => {
    render(<ReleaseChecklist projectId="project-1" />);

    expect(await screen.findByText("可以发布")).toBeVisible();
    expect(screen.getByText("修订 3 已验证")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重新运行质量检查" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/projects/project-1/validate", expect.objectContaining({ method: "POST" })));
  });
});
