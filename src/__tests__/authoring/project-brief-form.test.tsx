// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBriefForm } from "@/features/authoring/project-brief-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function okCreateResponse() {
  return new Response(
    JSON.stringify({
      project: {
        id: "project-created",
        title: "夜航船",
        premise: "一艘船驶入没有地图的海域。",
        genre: "悬疑",
        tone: "冷峻",
        pointOfView: "第三人称",
        rating: "PG-13",
        sizePreset: "short",
        targetNodeCount: 24,
        targetEndingCount: 4,
        status: "draft",
        activeDraftVersionId: "version-1",
        settingsJson: { language: "Chinese" },
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      },
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("项目名称"), "夜航船");
  await user.type(screen.getByLabelText("核心设定", { exact: false }), "一艘船驶入没有地图的海域。");
  await user.type(screen.getByLabelText("类型"), "悬疑");
  await user.type(screen.getByLabelText("基调"), "冷峻");
  await user.type(screen.getByLabelText("叙事视角"), "第三人称");
  await user.selectOptions(screen.getByLabelText("内容分级"), "PG-13");
}

describe("ProjectBriefForm", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("defaults to short and exposes the locked preset ranges", async () => {
    const user = userEvent.setup();
    render(<ProjectBriefForm />);

    expect(screen.getByRole("radio", { name: /短篇/ })).toBeChecked();
    expect(screen.getByLabelText("目标节点数")).toHaveValue(24);
    expect(screen.getByLabelText("目标结局数")).toHaveValue(4);

    await user.click(screen.getByRole("radio", { name: /微型/ }));
    expect(screen.getByLabelText("目标节点数")).toHaveValue(8);
    expect(screen.getByLabelText("目标结局数")).toHaveValue(2);
    expect(screen.getByText("8–15 个节点 · 2–3 个结局")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /中篇/ }));
    expect(screen.getByLabelText("目标节点数")).toHaveValue(48);
    expect(screen.getByLabelText("目标结局数")).toHaveValue(6);
    expect(screen.getByText("40–80 个节点 · 5–10 个结局")).toBeInTheDocument();
  });

  it("supports custom bounds and blocks an invalid target before the API call", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    render(<ProjectBriefForm />);
    await user.click(screen.getByRole("radio", { name: /自定义/ }));
    await fillRequiredFields(user);
    await user.clear(screen.getByLabelText("目标节点数"));
    await user.type(screen.getByLabelText("目标节点数"), "7");
    await user.click(screen.getByRole("button", { name: "创建项目" }));

    expect(screen.getByRole("alert")).toHaveTextContent("目标节点数需要在 8–80 之间");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks a custom size that cannot contain the requested endings", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    render(<ProjectBriefForm />);
    await user.click(screen.getByRole("radio", { name: /自定义/ }));
    await fillRequiredFields(user);
    await user.clear(screen.getByLabelText("目标节点数"));
    await user.type(screen.getByLabelText("目标节点数"), "8");
    await user.clear(screen.getByLabelText("目标结局数"));
    await user.type(screen.getByLabelText("目标结局数"), "10");
    await user.click(screen.getByRole("button", { name: "创建项目" }));

    expect(screen.getByRole("alert")).toHaveTextContent("结局数必须少于节点数至少 2 个");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the project and moves into the generation step", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(okCreateResponse());
    render(<ProjectBriefForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "创建项目" }));

    expect(await screen.findByText("项目已建立，正在进入分支写作…")).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/projects/project-created/generate");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
      body: expect.stringContaining('"language":"Chinese"'),
    }));
  });
});
