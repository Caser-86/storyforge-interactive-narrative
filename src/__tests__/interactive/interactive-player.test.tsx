// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InteractivePlayer } from "@/features/authoring/interactive-player";

const session = {
  id: "session-1",
  projectId: "project-1",
  status: "active" as const,
  turn: 1,
  targetTurns: 8,
  lastError: null,
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
  generation: {
    kind: "opening" as const,
    status: "succeeded" as const,
    attempt: 1,
    maxAttempts: 3,
    deadlineAt: "2026-08-22T00:30:00.000Z",
    startedAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:01.000Z",
    lastError: null,
  },
};

describe("InteractivePlayer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("labels the fake provider as a test-only mode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessions: [] }), { status: 200 })));

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" providerMode="fake" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("测试占位模式");
    expect(screen.getByRole("alert")).toHaveTextContent("不代表真实模型质量");
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

  it("prefers an explicit session deep link over the stale browser pointer", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const linkedSession = { ...session, id: "session-2", scene: { ...session.scene, title: "链接会话" } };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(url.endsWith("/play/sessions")
        ? new Response(JSON.stringify({ sessions: [linkedSession] }), { status: 200 })
        : new Response(JSON.stringify({ session: linkedSession }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" initialSessionId="session-2" />);

    expect(await screen.findByRole("heading", { name: "链接会话" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/play/session-2");
    expect(localStorage.getItem("storyforge:interactive-session:project-1")).toBe("session-2");
  });

  it("announces a ready scene to screen readers", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith("/play/sessions") ? { sessions: [session] }
        : url.endsWith("/turns") ? { turns: [] }
          : { session };
      return Promise.resolve(new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    const announcement = await screen.findByRole("status");
    expect(announcement).toHaveTextContent("第 1 幕已生成，请选择你的行动。");
    expect(announcement).toHaveAttribute("aria-live", "polite");
    expect(announcement).toHaveAttribute("aria-atomic", "true");
  });

  it("does not show choices while a previous generation is still in progress", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session: { ...session, status: "generating" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    expect(await screen.findByText("正在生成开场，请稍候。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "推门进入" })).not.toBeInTheDocument();
  });

  it("allows the author to cancel a generation in progress", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const canceledSession = { ...session, status: "failed" as const, scene: null, lastError: "作者取消了本次生成。" };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/cancel") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ session: canceledSession }), { status: 200 }));
      }
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session: { ...session, status: "generating" as const } }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await screen.findByText("正在生成开场，请稍候。");
    await userEvent.click(screen.getByRole("button", { name: "取消本次生成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("作者取消了本次生成。");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/play/session-1/cancel", expect.objectContaining({ method: "POST" }));
  });

  it("polls a generating session until the next scene is available", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("storyforge:interactive-session:project-1", session.id);
      const activeSession = { ...session, status: "active" as const };
      let sessionCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/play/session-1")) {
          sessionCallCount += 1;
          const payload = sessionCallCount === 1 ? { ...session, status: "generating" as const } : activeSession;
          return Promise.resolve(new Response(JSON.stringify({ session: payload }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }));
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("正在生成开场，请稍候。")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole("button", { name: /推门进入/ })).toBeInTheDocument();
      expect(sessionCallCount).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns keyboard focus to the first choice after the next scene is generated", async () => {
    let sessionReadCount = 0;
    const nextScene = {
      ...session,
      turn: 2,
      state: { ...session.state, turn: 2 },
      scene: {
        ...session.scene,
        title: "下一幕",
        choices: [{ id: "next-choice", label: "进入下一幕", intent: "继续调查", risk: "medium" as const, consequencePreview: "你会获得新的线索。" }],
      },
      generation: { ...session.generation, kind: "next" as const },
    };
    const generatingSession = { ...session, status: "generating" as const, generation: { ...session.generation, kind: "next" as const, status: "queued" as const } };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ session: generatingSession }), { status: 202 }));
      }
      if (url.endsWith("/play/session-1")) {
        sessionReadCount += 1;
        return Promise.resolve(new Response(JSON.stringify({ session: sessionReadCount === 1 ? session : nextScene }), { status: 200 }));
      }
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }));
      if (url.endsWith("/turns")) return Promise.resolve(new Response(JSON.stringify({ turns: [] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
    });
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await userEvent.click(await screen.findByRole("button", { name: /推门进入/ }));
    const nextChoice = await screen.findByRole("button", { name: /进入下一幕/ }, { timeout: 3_000 });
    expect(document.activeElement).toBe(nextChoice);
  });

  it("refreshes the written path when a new turn becomes available", async () => {
    const nextSession = {
      ...session,
      turn: 2,
      state: { ...session.state, turn: 2 },
      scene: { ...session.scene, title: "下一幕" },
    };
    const firstTurn = { turn: 1, scene: session.scene, selectedChoiceId: "choice_a", selectedChoiceLabel: "推门进入", createdAt: session.createdAt };
    const secondTurn = { turn: 2, scene: nextSession.scene, selectedChoiceId: null, selectedChoiceLabel: null, createdAt: session.updatedAt };
    let turnsRequestCount = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ session: nextSession }), { status: 200 }));
      }
      if (url.endsWith("/play/session-1")) return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }));
      if (url.endsWith("/turns")) {
        turnsRequestCount += 1;
        return Promise.resolve(new Response(JSON.stringify({ turns: turnsRequestCount === 1 ? [firstTurn] : [firstTurn, secondTurn] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
    });
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await userEvent.click(await screen.findByRole("button", { name: /推门进入/ }));
    expect(await screen.findByRole("heading", { name: "下一幕" })).toBeInTheDocument();
    expect(await screen.findByText("作者选择：推门进入")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(turnsRequestCount).toBe(2);
  });

  it("shows a retryable error when the next scene generation is released", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const failedGeneration = {
      ...session,
      lastError: "下一幕生成超时，当前选择已恢复，可以重新选择。",
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(new Response(
        url.endsWith("/play/sessions")
          ? JSON.stringify({ sessions: [failedGeneration] })
          : JSON.stringify({ session: failedGeneration }),
        { status: 200 },
      ));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("下一幕生成超时，当前选择已恢复，可以重新选择。");
    expect(screen.getByRole("button", { name: /推门进入/ })).toBeInTheDocument();
  });

  it("updates the current history status after a generation error is restored", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const failedSession = {
      ...session,
      lastError: "下一幕生成超时，当前选择已恢复，可以重新选择。",
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }));
      if (url.endsWith("/turns")) return Promise.resolve(new Response(JSON.stringify({ turns: [] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session: failedSession }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("下一幕生成超时，当前选择已恢复，可以重新选择。");
    expect(await screen.findByText("需重试")).toBeInTheDocument();
    expect(screen.queryByText("进行中")).not.toBeInTheDocument();
  });

  it("keeps an opening failure visible and offers a fresh retry", async () => {
    const failedSession = { ...session, status: "failed" as const, scene: null, lastError: "开场生成超时，请重试。" };
    localStorage.setItem("storyforge:interactive-session:project-1", failedSession.id);
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(new Response(
        url.endsWith("/play/sessions")
          ? JSON.stringify({ sessions: [failedSession] })
          : JSON.stringify({ session: failedSession }),
        { status: 200 },
      ));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("开场生成超时，请重试。");
    expect(screen.getByRole("button", { name: "重新生成开场" })).toBeInTheDocument();
    expect(localStorage.getItem("storyforge:interactive-session:project-1")).toBe(failedSession.id);
  });

  it("does not let a stale choice response replace a session selected from history", async () => {
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    const secondSession = {
      ...session,
      id: "session-2",
      turn: 2,
      state: { ...session.state, turn: 2 },
      scene: { ...session.scene, title: "另一条写作记录" },
    };
    const nextSession = {
      ...session,
      turn: 2,
      state: { ...session.state, turn: 2 },
      scene: { ...session.scene, title: "迟到的下一幕" },
    };
    let resolveChoice!: (response: Response) => void;
    const choiceResponse = new Promise<Response>((resolve) => {
      resolveChoice = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1") && init?.method === "POST") return choiceResponse;
      if (url.endsWith("/play/session-2")) return Promise.resolve(new Response(JSON.stringify({ session: secondSession }), { status: 200 }));
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [session, secondSession] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);
    await screen.findByRole("heading", { name: "门前" });

    await userEvent.click(screen.getByRole("button", { name: /推门进入/ }));
    await userEvent.click(screen.getByRole("button", { name: "恢复第九档案室第 2 幕" }));
    expect(await screen.findByRole("heading", { name: "另一条写作记录" })).toBeInTheDocument();

    resolveChoice(new Response(JSON.stringify({ session: nextSession }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "另一条写作记录" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "迟到的下一幕" })).not.toBeInTheDocument();
  });

  it("refreshes the current scene after a stale choice conflict without choosing for the author", async () => {
    const refreshedSession = { ...session, scene: { ...session.scene, title: "已更新的门前" } };
    let sessionReadCount = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: { code: "CONFLICT", message: "当前场景已更新，请刷新后重新选择。" } }), { status: 409 }));
      }
      if (url.endsWith("/play/session-1")) {
        sessionReadCount += 1;
        return Promise.resolve(new Response(JSON.stringify({ session: sessionReadCount === 1 ? session : refreshedSession }), { status: 200 }));
      }
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [refreshedSession] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
    });
    localStorage.setItem("storyforge:interactive-session:project-1", session.id);
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await screen.findByRole("heading", { name: "门前" });
    await userEvent.click(screen.getByRole("button", { name: /推门进入/ }));

    expect(await screen.findByRole("heading", { name: "已更新的门前" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("当前场景已更新，请刷新后重新选择。");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/play/session-1", expect.objectContaining({ method: "POST" }));
  });

  it("falls back to server history when local storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [session] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await userEvent.click(await screen.findByRole("button", { name: "恢复第九档案室第 1 幕" }));
    expect(await screen.findByRole("heading", { name: "门前" })).toBeInTheDocument();
  });

  it("shows persisted history and removes a deleted session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [session], nextCursor: "cursor-1" }), {
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
    expect(screen.getByRole("button", { name: "加载更多记录" })).toBeInTheDocument();
  });

  it("loads the next page of history without replacing the current page", async () => {
    const nextHistorySession = { ...session, id: "session-2", turn: 2 };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cursor=cursor-1")) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [nextHistorySession], nextCursor: null }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ sessions: [session], nextCursor: "cursor-1" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await screen.findByRole("button", { name: "恢复第九档案室第 1 幕" });
    await userEvent.click(screen.getByRole("button", { name: "加载更多记录" }));

    expect(await screen.findByRole("button", { name: "恢复第九档案室第 2 幕" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复第九档案室第 1 幕" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/play/sessions?limit=50&cursor=cursor-1");
    expect(screen.queryByRole("button", { name: "加载更多记录" })).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "删除第九档案室第 2 幕" }));
    expect(screen.queryByRole("button", { name: "恢复第九档案室第 1 幕" })).not.toBeInTheDocument();

    resolveRefresh(new Response(JSON.stringify({ sessions: [nextSession] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "恢复第九档案室第 2 幕" })).not.toBeInTheDocument());
  });

  it("offers to save an ended selected path as a formal draft", async () => {
    const endedSession = { ...session, status: "ended" as const, turn: 8, materializedVersionId: null, state: { ...session.state, turn: 8 }, scene: { ...session.scene, title: "收束", body: "所有线索合拢。", summary: "真相已经完整。", choices: [], isEnding: true, endingSummary: "故事结束。" } };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1/materialize") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ project: { activeDraftVersionId: "version-2" }, version: { id: "version-2" }, graph: {}, created: true }), { status: 201 }));
      }
      if (url.endsWith("/play/sessions")) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [endedSession] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ session: endedSession }), { status: 200 }));
    });
    localStorage.setItem("storyforge:interactive-session:project-1", endedSession.id);
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await userEvent.click(await screen.findByRole("button", { name: "保存为正式故事草稿" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/play/session-1/materialize",
      { method: "POST" },
    ));
    expect(await screen.findByText("已保存为正式故事草稿")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入编辑器" })).toHaveAttribute("href", "/projects/project-1/edit");
  });

  it("keeps the materialized status in history after saving the formal draft", async () => {
    const endedSession = { ...session, status: "ended" as const, turn: 8, materializedVersionId: null, state: { ...session.state, turn: 8 }, scene: { ...session.scene, title: "收束", body: "所有线索合拢。", summary: "真相已经完整。", choices: [], isEnding: true, endingSummary: "故事结束。" } };
    const materializedSession = { ...endedSession, materializedVersionId: "version-2" };
    let historyCallCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1/materialize") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ version: { id: "version-2" } }), { status: 201 }));
      }
      if (url.endsWith("/play/sessions")) {
        historyCallCount += 1;
        return Promise.resolve(new Response(JSON.stringify({ sessions: [historyCallCount === 1 ? endedSession : materializedSession] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ session: endedSession }), { status: 200 }));
    });
    localStorage.setItem("storyforge:interactive-session:project-1", endedSession.id);
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await userEvent.click(await screen.findByRole("button", { name: "保存为正式故事草稿" }));
    expect(await screen.findByText("已保存为正式故事草稿")).toBeInTheDocument();
    expect(await screen.findByText("已落稿")).toBeInTheDocument();
  });

  it("does not let a stale materialize response update a different session", async () => {
    const endedSession = { ...session, status: "ended" as const, turn: 8, materializedVersionId: null, state: { ...session.state, turn: 8 }, scene: { ...session.scene, title: "收束", body: "所有线索合拢。", summary: "真相已经完整。", choices: [], isEnding: true, endingSummary: "故事结束。" } };
    const secondSession = { ...session, id: "session-2", turn: 2, state: { ...session.state, turn: 2 }, scene: { ...session.scene, title: "另一条写作记录" } };
    let resolveMaterialize!: (response: Response) => void;
    const materializeResponse = new Promise<Response>((resolve) => {
      resolveMaterialize = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/play/session-1/materialize") && init?.method === "POST") return materializeResponse;
      if (url.endsWith("/play/session-2")) return Promise.resolve(new Response(JSON.stringify({ session: secondSession }), { status: 200 }));
      if (url.endsWith("/play/sessions")) return Promise.resolve(new Response(JSON.stringify({ sessions: [endedSession, secondSession] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ session: endedSession }), { status: 200 }));
    });
    localStorage.setItem("storyforge:interactive-session:project-1", endedSession.id);
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractivePlayer projectId="project-1" projectTitle="第九档案室" />);

    await userEvent.click(await screen.findByRole("button", { name: "保存为正式故事草稿" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/play/session-1/materialize",
      { method: "POST" },
    ));
    await userEvent.click(screen.getByRole("button", { name: "恢复第九档案室第 2 幕" }));
    expect(await screen.findByRole("heading", { name: "另一条写作记录" })).toBeInTheDocument();

    resolveMaterialize(new Response(JSON.stringify({ version: { id: "version-2" } }), { status: 201 }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "另一条写作记录" })).toBeInTheDocument());
    expect(screen.queryByText("已保存为正式故事草稿")).not.toBeInTheDocument();
  });
});
