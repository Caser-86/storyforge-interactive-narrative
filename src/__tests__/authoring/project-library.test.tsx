// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectLibrary } from "@/features/authoring/project-library";
import type { ProjectSummary } from "@/lib/authoring/repository";

const baseProject: ProjectSummary = {
  id: "project-1",
  title: "潮汐档案",
  premise: "退潮后出现一座不该存在的城市。",
  genre: "悬疑奇幻",
  tone: "克制",
  pointOfView: "第三人称",
  rating: "PG-13",
  sizePreset: "short",
  targetNodeCount: 24,
  targetEndingCount: 4,
  status: "draft",
  activeDraftVersionId: "version-1",
  settingsJson: {},
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  draftRevision: 0,
  versionCount: 1,
  snapshotCount: 0,
  blockingIssueCount: 0,
};

describe("ProjectLibrary", () => {
  it("filters projects by title and status", async () => {
    const user = userEvent.setup();
    const archived = { ...baseProject, id: "project-2", title: "归档手记", status: "archived" as const };
    vi.stubGlobal("fetch", vi.fn());

    render(<ProjectLibrary projects={[baseProject, archived]} />);

    await user.type(screen.getByLabelText("筛选项目"), "潮汐");
    expect(screen.getByRole("heading", { name: "潮汐档案" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "归档手记" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("筛选项目"));
    await user.selectOptions(screen.getByLabelText("项目状态"), "archived");
    expect(screen.getByRole("heading", { name: "归档手记" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "潮汐档案" })).not.toBeInTheDocument();
  });
});
