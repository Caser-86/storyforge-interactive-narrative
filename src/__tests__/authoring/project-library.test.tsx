// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "@/lib/authoring/repository";
import { ProjectLibrary } from "@/features/authoring/project-library";

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "project-1",
    title: "潮汐档案",
    premise: "一名档案员在退潮后发现一座不该存在的城市。",
    genre: "悬疑奇幻",
    tone: "克制、潮湿、带有微光",
    pointOfView: "第三人称限知",
    rating: "PG-13",
    sizePreset: "short",
    targetNodeCount: 20,
    targetEndingCount: 4,
    status: "draft",
    activeDraftVersionId: "version-1",
    settingsJson: {},
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-21T08:30:00.000Z",
    draftRevision: 3,
    versionCount: 1,
    snapshotCount: 0,
    blockingIssueCount: 2,
    ...overrides,
  };
}

describe("ProjectLibrary", () => {
  it("renders a useful empty state with a create entry point", () => {
    render(<ProjectLibrary projects={[]} />);

    expect(screen.getByRole("heading", { name: "项目库" })).toBeInTheDocument();
    expect(screen.getByText("还没有项目")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新建项目" })).toHaveAttribute("href", "/projects/new");
  });

  it("renders project status, structure counts, blocking issues, and editor entry", () => {
    render(<ProjectLibrary projects={[project()]} />);

    expect(screen.getByRole("heading", { name: "潮汐档案" })).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByLabelText("20 个节点")).toBeInTheDocument();
    expect(screen.getByLabelText("4 个结局")).toBeInTheDocument();
    expect(screen.getByLabelText("2 个阻断问题")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开项目" })).toHaveAttribute("href", "/projects/project-1/edit");
    expect(screen.getByRole("button", { name: "复制潮汐档案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档潮汐档案" })).toBeInTheDocument();
  });

  it("keeps the library usable when the initial server load fails", () => {
    render(<ProjectLibrary projects={[]} initialError="项目库暂时无法读取" />);

    expect(screen.getByRole("alert")).toHaveTextContent("项目库暂时无法读取");
    expect(screen.getByRole("link", { name: "新建项目" })).toBeInTheDocument();
  });
});
