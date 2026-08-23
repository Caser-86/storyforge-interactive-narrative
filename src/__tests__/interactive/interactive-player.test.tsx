// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InteractivePlayer } from "@/features/authoring/interactive-player";

const session = {
  id: "session-1",
  projectId: "project-1",
  status: "active" as const,
  turn: 1,
  targetTurns: 8,
  state: {
    seedPrompt: "一名档案员发现一扇不该存在的门。",
    turn: 1,
    targetTurns: 8,
    knownFacts: [],
    openThreads: [],
    resolvedThreads: [],
    lastChoiceImpact: "",
    endingReadiness: 0,
  },
  scene: {
    title: "门前",
    body: "林缇站在门前。",
    summary: "她必须做出决定。",
    choices: [
      { id: "choice_a", label: "推门进入", intent: "确认门后的记录", risk: "medium" as const, consequencePreview: "你会立即看到线索。" },
      { id: "choice_b", label: "先行调查", intent: "寻找更安全的入口", risk: "low" as const, consequencePreview: "你会获得额外信息。" },
    ],
    isEnding: false,
    endingSummary: null,
  },
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("InteractivePlayer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores a persisted session after the page is reopened", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    expect(await screen.findByRole("heading", { name: "门前" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/play/session-1");
  });

  it("does not show choices while a previous generation is still in progress", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session: { ...session, status: "generating" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    expect(await screen.findByText("上一段生成尚未完成，请稍候刷新")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "推门进入" })).not.toBeInTheDocument();
  });

  it("shows persisted history and removes a deleted session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [session] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    const resume = await screen.findByRole("button", { name: "恢复第九档案室第 1 幕" });
    expect(resume).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "删除第九档案室第 1 幕" }));

    expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/project-1/play/sessions/session-1", { method: "DELETE" });
    expect(screen.queryByRole("button", { name: "恢复第九档案室第 1 幕" })).not.toBeInTheDocument();
  });

  it("does not let a stale history refresh restore a deleted session", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    let sessionsCallCount = 0;
    let resolveRefresh!: (response: Response) => void;
    const refreshPromise = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const nextSession = { ...session, turn: 2, state: { ...session.state, turn: 2 } };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ session: nextSession }), { status: 200 }));
      }
      if (url.endsWith("/play/sessions/session-1") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.endsWith("/play/sessions")) {
        sessionsCallCount += 1;
        return sessionsCallCount === 1
          ? Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }))
          : refreshPromise;
      }
      return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await screen.findByRole("button", { name: "删除第九档案室第 1 幕" });
    await userEvent.click(screen.getByRole("button", { name: /推门进入/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/play/session-1",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(sessionsCallCount).toBe(2));
    await userEvent.click(screen.getByRole("button", { name: "删除第九档案室第 1 幕" }));
    expect(screen.queryByRole("button", { name: "恢复第九档案室第 1 幕" })).not.toBeInTheDocument();

    resolveRefresh(new Response(JSON.stringify({ sessions: [nextSession] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "恢复第九档案室第 2 幕" })).not.toBeInTheDocument());
  });
});
