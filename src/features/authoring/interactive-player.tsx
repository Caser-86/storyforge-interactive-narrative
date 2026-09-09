"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InteractiveSession, InteractiveSessionSummary, InteractiveTurnRecord } from "@/lib/interactive/schemas";

type InteractivePlayerProps = {
  projectId: string;
  projectTitle: string;
  providerMode?: "fake" | "openai";
  initialSessionId?: string;
};
const HISTORY_MORE_ID = "__history_more__";

function readStoredSessionId(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStoredSessionId(storageKey: string, sessionId: string): void {
  try {
    window.localStorage.setItem(storageKey, sessionId);
  } catch {
    // Server-side history remains available when browser storage is blocked.
  }
}

function removeStoredSessionId(storageKey: string): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // No local cleanup is needed when browser storage is unavailable.
  }
}

function sessionStatusLabel(status: InteractiveSession["status"], materializedVersionId: string | null, lastError: string | null): string {
  if (materializedVersionId) return "已落稿";
  if (status === "active" && lastError) return "需重试";
  return status === "ended" ? "已结束" : status === "active" ? "进行中" : status === "generating" ? "生成中" : "失败";
}

function syncHistorySummary(items: InteractiveSessionSummary[], nextSession: InteractiveSession): InteractiveSessionSummary[] {
  return items.map((item) => item.id === nextSession.id
    ? {
        ...item,
        status: nextSession.status,
        turn: nextSession.turn,
        targetTurns: nextSession.targetTurns,
        lastError: nextSession.lastError,
        materializedVersionId: nextSession.materializedVersionId,
        updatedAt: nextSession.updatedAt,
      }
    : item);
}

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) return "尚未领取";
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  const seconds = Math.floor(elapsed / 1_000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function InteractivePlayer({ projectId, projectTitle, providerMode = "openai", initialSessionId }: InteractivePlayerProps) {
  const [session, setSession] = useState<InteractiveSession | null>(null);
  const [history, setHistory] = useState<InteractiveSessionSummary[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [turns, setTurns] = useState<InteractiveTurnRecord[]>([]);
  const [turnsSessionId, setTurnsSessionId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const deletedHistoryIdsRef = useRef(new Set<string>());
  const sessionRequestIdRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeSessionSummaryRef = useRef<InteractiveSession | null>(null);
  const previousSceneKeyRef = useRef<string | null>(null);
  const firstChoiceRef = useRef<HTMLButtonElement | null>(null);
  const storageKey = `storyforge:interactive-session:${projectId}`;

  function beginSessionRequest(): number {
    sessionRequestIdRef.current += 1;
    return sessionRequestIdRef.current;
  }

  function isCurrentSessionRequest(requestId: number, expectedSessionId?: string): boolean {
    return sessionRequestIdRef.current === requestId
      && (expectedSessionId === undefined || activeSessionIdRef.current === expectedSessionId);
  }

  const activateSession = useCallback((nextSession: InteractiveSession, requestId?: number): boolean => {
    if (requestId !== undefined && sessionRequestIdRef.current !== requestId) return false;
    activeSessionIdRef.current = nextSession.id;
    activeSessionSummaryRef.current = nextSession;
    setSession(nextSession);
    setHistory((current) => syncHistorySummary(current, nextSession));
    setError(nextSession.lastError);
    writeStoredSessionId(storageKey, nextSession.id);
    return true;
  }, [storageKey]);

  const resetSession = useCallback((): void => {
    beginSessionRequest();
    activeSessionIdRef.current = null;
    activeSessionSummaryRef.current = null;
    setSession(null);
    setError(null);
    removeStoredSessionId(storageKey);
  }, [storageKey]);

  useEffect(() => {
    let canceled = false;
    const requestId = sessionRequestIdRef.current;
    const savedSessionId = initialSessionId?.trim() || readStoredSessionId(storageKey);

    if (!savedSessionId) {
      return () => {
        canceled = true;
      };
    }

    void fetch(`/api/projects/${projectId}/play/${encodeURIComponent(savedSessionId)}`)
      .then(async (response) => {
        const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
        if (response.status === 404) {
          if (!canceled && isCurrentSessionRequest(requestId)) {
            activeSessionIdRef.current = null;
            if (!initialSessionId) removeStoredSessionId(storageKey);
          }
          return;
        }
        if (!response.ok || !payload.session) {
          throw new Error(payload.error?.message ?? "互动进度恢复失败");
        }
        if (!canceled && isCurrentSessionRequest(requestId)) {
          activateSession(payload.session, requestId);
        }
      })
      .catch((restoreError) => {
        if (!canceled && isCurrentSessionRequest(requestId)) setError(restoreError instanceof Error ? restoreError.message : "互动进度恢复失败");
      });

    return () => {
      canceled = true;
    };
  }, [activateSession, initialSessionId, projectId, storageKey]);

  const generatingSessionId = session?.status === "generating" ? session.id : null;

  useEffect(() => {
    if (!generatingSessionId) return;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [generatingSessionId]);

  useEffect(() => {
    const currentSessionId = session?.id;
    if (!currentSessionId) {
      return;
    }
    let canceled = false;
    void fetch(`/api/projects/${projectId}/play/${encodeURIComponent(currentSessionId)}/turns`)
      .then(async (response) => {
        const payload = await response.json() as { turns?: InteractiveTurnRecord[] };
        if (!response.ok || !Array.isArray(payload.turns)) throw new Error("互动路径读取失败");
        if (!canceled && activeSessionIdRef.current === currentSessionId) {
          setTurnsSessionId(currentSessionId);
          setTurns(payload.turns);
        }
      })
      .catch(() => {
        if (!canceled && activeSessionIdRef.current === currentSessionId) {
          setTurnsSessionId(currentSessionId);
          setTurns([]);
        }
      });
    return () => {
      canceled = true;
    };
  }, [projectId, session?.id, session?.turn]);

  useEffect(() => {
    if (!generatingSessionId) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollAttempt = 0;
    let polling = false;

    const schedule = (delay: number) => {
      if (canceled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (canceled || polling || activeSessionIdRef.current !== generatingSessionId) return;
      polling = true;
      try {
        const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(generatingSessionId)}`);
        const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
        if (response.status === 404) {
          if (!canceled && activeSessionIdRef.current === generatingSessionId) resetSession();
          return;
        }
        if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "互动进度恢复失败");
        if (canceled || activeSessionIdRef.current !== generatingSessionId) return;
        activateSession(payload.session);
        pollAttempt = payload.session.status === "generating" ? Math.min(pollAttempt + 1, 3) : 0;
        if (payload.session.status === "generating") {
          const delay = document.visibilityState === "hidden" ? 5_000 : Math.min(8_000, 1_000 * (2 ** pollAttempt));
          schedule(delay);
        }
      } catch (pollError) {
        if (!canceled && activeSessionIdRef.current === generatingSessionId) {
          setError(pollError instanceof Error ? pollError.message : "互动进度恢复失败");
          pollAttempt = Math.min(pollAttempt + 1, 3);
          schedule(document.visibilityState === "hidden" ? 5_000 : Math.min(10_000, 1_500 * (2 ** pollAttempt)));
        }
      } finally {
        polling = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollAttempt = 0;
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule(750);
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activateSession, generatingSessionId, projectId, resetSession, storageKey]);

  useEffect(() => {
    const sceneKey = session?.scene && !session.scene.isEnding ? `${session.id}:${session.turn}` : null;
    const previousSceneKey = previousSceneKeyRef.current;
    previousSceneKeyRef.current = sceneKey;
    if (!sceneKey || sceneKey === previousSceneKey || session?.status !== "active") return;
    if (document.activeElement === document.body) firstChoiceRef.current?.focus();
  }, [session?.id, session?.scene, session?.status, session?.turn]);

  useEffect(() => {
    let canceled = false;
    void fetch(`/api/projects/${projectId}/play/sessions`)
      .then(async (response) => {
        const payload = await response.json() as { sessions?: InteractiveSessionSummary[]; nextCursor?: string | null; error?: { message?: string } };
        if (!response.ok || !Array.isArray(payload.sessions)) throw new Error(payload.error?.message ?? "互动记录读取失败");
        if (!canceled) {
          setHistoryError(null);
          const loaded = payload.sessions.filter((item) => !deletedHistoryIdsRef.current.has(item.id));
          const active = activeSessionSummaryRef.current;
          setHistory(active ? syncHistorySummary(loaded, active) : loaded);
          setHistoryNextCursor(payload.nextCursor ?? null);
        }
      })
      .catch((historyLoadError) => {
        if (!canceled) setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : "互动记录读取失败");
      });

    return () => {
      canceled = true;
    };
  }, [projectId]);

  async function refreshHistory(): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${projectId}/play/sessions`);
      const payload = await response.json() as { sessions?: InteractiveSessionSummary[]; nextCursor?: string | null; error?: { message?: string } };
      if (!response.ok || !Array.isArray(payload.sessions)) throw new Error(payload.error?.message ?? "互动记录读取失败");
      setHistoryError(null);
      const loaded = payload.sessions.filter((item) => !deletedHistoryIdsRef.current.has(item.id));
      const active = activeSessionSummaryRef.current;
      setHistory(active ? syncHistorySummary(loaded, active) : loaded);
      setHistoryNextCursor(payload.nextCursor ?? null);
    } catch (historyLoadError) {
      setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : "互动记录读取失败");
    }
  }

  async function loadMoreHistory(): Promise<void> {
    if (!historyNextCursor || historyBusyId !== null) return;
    setHistoryBusyId(HISTORY_MORE_ID);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/sessions?limit=50&cursor=${encodeURIComponent(historyNextCursor)}`);
      const payload = await response.json() as { sessions?: InteractiveSessionSummary[]; nextCursor?: string | null; error?: { message?: string } };
      if (!response.ok || !Array.isArray(payload.sessions)) throw new Error(payload.error?.message ?? "互动记录读取失败");
      setHistory((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        const merged = [...current, ...payload.sessions!.filter((item) => !knownIds.has(item.id) && !deletedHistoryIdsRef.current.has(item.id))];
        const active = activeSessionSummaryRef.current;
        return active ? syncHistorySummary(merged, active) : merged;
      });
      setHistoryNextCursor(payload.nextCursor ?? null);
    } catch (historyLoadError) {
      setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : "互动记录读取失败");
    } finally {
      setHistoryBusyId(null);
    }
  }

  async function start() {
    if (readStoredSessionId(storageKey) && !error) {
      setError("正在恢复互动进度，请稍候…");
      return;
    }

    const requestId = beginSessionRequest();
    activeSessionIdRef.current = null;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play`, { method: "POST" });
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "开场生成失败");
      if (!isCurrentSessionRequest(requestId)) return;
      activateSession(payload.session, requestId);
      void refreshHistory();
    } catch (startError) {
      if (isCurrentSessionRequest(requestId)) setError(startError instanceof Error ? startError.message : "开场生成失败");
    } finally {
      if (isCurrentSessionRequest(requestId)) setIsBusy(false);
    }
  }

  async function choose(choiceId: string) {
    if (!session || session.status !== "active" || isBusy) return;
    const selectedSessionId = session.id;
    const expectedTurn = session.turn;
    const requestId = beginSessionRequest();
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${selectedSessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choiceId, expectedTurn }),
      });
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (response.status === 409) {
        const conflictMessage = payload.error?.message ?? "当前场景已更新，请刷新后重新选择。";
        const refreshResponse = await fetch(`/api/projects/${projectId}/play/${selectedSessionId}`);
        const refreshPayload = await refreshResponse.json() as { session?: InteractiveSession; error?: { message?: string } };
        if (!refreshResponse.ok || !refreshPayload.session) throw new Error(conflictMessage);
        if (isCurrentSessionRequest(requestId, selectedSessionId)) {
          activateSession(refreshPayload.session, requestId);
          setError(conflictMessage);
        }
        return;
      }
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "下一段生成失败");
      if (!isCurrentSessionRequest(requestId, selectedSessionId)) return;
      activateSession(payload.session, requestId);
      void refreshHistory();
    } catch (choiceError) {
      if (isCurrentSessionRequest(requestId, selectedSessionId)) setError(choiceError instanceof Error ? choiceError.message : "下一段生成失败");
    } finally {
      if (isCurrentSessionRequest(requestId, selectedSessionId)) setIsBusy(false);
    }
  }

  async function materialize() {
    if (!session || session.status !== "ended" || session.materializedVersionId || isBusy) return;
    const selectedSessionId = session.id;
    const requestId = beginSessionRequest();
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(selectedSessionId)}/materialize`, { method: "POST" });
      const payload = await response.json() as { version?: { id: string }; error?: { message?: string } };
      if (!response.ok || !payload.version) throw new Error(payload.error?.message ?? "正式故事草稿保存失败");
      if (!isCurrentSessionRequest(requestId, selectedSessionId)) return;
      const materializedSession = { ...session, materializedVersionId: payload.version.id };
      activeSessionSummaryRef.current = materializedSession;
      setSession(materializedSession);
      setHistory((current) => syncHistorySummary(current, materializedSession));
      void refreshHistory();
    } catch (materializeError) {
      if (isCurrentSessionRequest(requestId, selectedSessionId)) setError(materializeError instanceof Error ? materializeError.message : "正式故事草稿保存失败");
    } finally {
      if (isCurrentSessionRequest(requestId, selectedSessionId)) setIsBusy(false);
    }
  }

  async function cancelGeneration() {
    if (!session || session.status !== "generating" || isBusy) return;
    const selectedSessionId = session.id;
    const requestId = beginSessionRequest();
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(selectedSessionId)}/cancel`, { method: "POST" });
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "取消生成失败");
      if (isCurrentSessionRequest(requestId, selectedSessionId)) activateSession(payload.session, requestId);
    } catch (cancelError) {
      if (isCurrentSessionRequest(requestId, selectedSessionId)) setError(cancelError instanceof Error ? cancelError.message : "取消生成失败");
    } finally {
      if (isCurrentSessionRequest(requestId, selectedSessionId)) setIsBusy(false);
    }
  }

  async function resumeHistorySession(sessionId: string): Promise<void> {
    const requestId = beginSessionRequest();
    setHistoryBusyId(sessionId);
    setIsBusy(false);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(sessionId)}`);
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "互动记录恢复失败");
      if (isCurrentSessionRequest(requestId)) activateSession(payload.session, requestId);
    } catch (resumeError) {
      if (isCurrentSessionRequest(requestId)) setError(resumeError instanceof Error ? resumeError.message : "互动记录恢复失败");
    } finally {
      if (isCurrentSessionRequest(requestId)) setHistoryBusyId(null);
    }
  }

  async function deleteHistorySession(sessionId: string): Promise<void> {
    if (!window.confirm("确定删除这条互动记录吗？此操作无法撤销。")) return;
    const requestId = beginSessionRequest();
    setHistoryBusyId(sessionId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      const payload = response.status === 204 ? null : await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload?.error?.message ?? "互动记录删除失败");
      deletedHistoryIdsRef.current.add(sessionId);
      setHistory((current) => current.filter((item) => item.id !== sessionId));
      if (readStoredSessionId(storageKey) === sessionId && activeSessionIdRef.current === sessionId && isCurrentSessionRequest(requestId)) {
        resetSession();
      }
    } catch (deleteError) {
      if (isCurrentSessionRequest(requestId)) setHistoryError(deleteError instanceof Error ? deleteError.message : "互动记录删除失败");
    } finally {
      if (isCurrentSessionRequest(requestId)) setHistoryBusyId(null);
    }
  }

  const scene = session?.scene;
  const visibleTurns = turnsSessionId === session?.id ? turns : [];
  const screenReaderAnnouncement = session && scene && session.status !== "generating" && session.status !== "failed"
    ? scene.isEnding || session.status === "ended"
      ? "故事已经收束，可以保存为正式故事草稿。"
      : `第 ${session.state.turn} 幕已生成，请选择你的行动。`
    : null;
  return (
    <main className="interactive-page">
      <header className="interactive-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">SF</span>
          <div><p className="eyebrow">BRANCH WRITING / AUTHORING</p><p className="brand-name">{projectTitle}</p></div>
        </div>
        <div className="interactive-header-actions">
          <Link className="text-link" href={`/projects/${projectId}/edit`}>返回编辑器</Link>
          <Link className="text-link" href={`/projects/${projectId}/generate/structured`}>一次性结构化生成</Link>
        </div>
      </header>

      {providerMode === "fake" ? (
        <div className="interactive-provider-notice" role="alert">
          当前为测试占位模式，生成内容不代表真实模型质量。
        </div>
      ) : null}

      {!session ? (
        <section className="interactive-start">
          <p className="eyebrow">WRITER-DRIVEN GENERATION</p>
          <h1>你选择方向，故事逐幕成形。</h1>
          <p>每次只生成当前场景和下一组选项，不预生成未选择的分支。你亲自走完一条路径后，已配置的文本模型负责收束，并可保存为正式故事草稿。</p>
          {error ? <p className="interactive-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="button" disabled={isBusy} onClick={() => void start()}>{isBusy ? "正在生成开场…" : "开始分支写作"}</button>
        </section>
      ) : (
        <section className="interactive-stage">
          {screenReaderAnnouncement ? <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{screenReaderAnnouncement}</p> : null}
          <div className="interactive-progress"><span>第 {session.state.turn} / {session.state.targetTurns} 幕</span><span>{session.status === "ended" ? "故事已结束" : session.status === "failed" ? "生成失败" : session.status === "generating" ? (session.generation?.status === "queued" ? "排队中" : "正在生成") : isBusy ? "正在根据你的选择生成…" : "等待选择"}</span></div>
          {scene ? <article className="interactive-scene">
            <p className="eyebrow">{scene.isEnding ? "ENDING" : `SCENE ${String(session.state.turn).padStart(2, "0")}`}</p>
            <h1>{scene.title}</h1>
            <div className="interactive-body">{scene.body.split(/\n\s*\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
            <p className="interactive-summary">{scene.summary}</p>
          </article> : null}
          {error ? <p className="interactive-error" role="alert">{error}</p> : null}
          {session.status === "failed" ? (
          <div className="interactive-ending">
            <strong>这一幕没有完成，可以保留当前记录并重新生成开场。</strong>
            <button className="button button-primary button-small" type="button" disabled={isBusy} onClick={() => { resetSession(); void start(); }}>{isBusy ? "正在生成开场…" : "重新生成开场"}</button>
            <button className="button button-small button-quiet" type="button" disabled={isBusy} onClick={resetSession}>清除失败记录</button>
          </div>
          ) : session.status === "generating" ? (
          <div className="interactive-generating-actions">
            <div className="interactive-generation-status" role="status">
              <p className="interactive-error">{session.generation?.status === "queued" ? "已进入生成队列，请稍候。" : session.generation?.kind === "opening" ? "正在生成开场，请稍候。" : "正在根据当前选择生成下一幕，请稍候。"}</p>
              <small>{session.generation ? `第 ${session.generation.attempt} / ${session.generation.maxAttempts} 次尝试 · 已耗时 ${formatElapsed(session.generation.startedAt, clock)}` : "任务状态同步中"}</small>
            </div>
            <button className="button button-small button-quiet" type="button" disabled={isBusy} onClick={() => void cancelGeneration()}>{isBusy ? "正在取消…" : "取消本次生成"}</button>
          </div>
          ) : session.status === "ended" || scene?.isEnding ? (
          <div className="interactive-ending">
            <strong>{scene?.endingSummary ?? "本次分支写作已收束。"}</strong>
            {session.materializedVersionId ? <div className="interactive-draft-saved"><span>已保存为正式故事草稿</span><Link className="text-link" href={`/projects/${projectId}/edit`}>进入编辑器</Link></div> : <button className="button button-primary button-small" type="button" disabled={isBusy} onClick={() => void materialize()}>{isBusy ? "正在保存草稿…" : "保存为正式故事草稿"}</button>}
            <button className="button button-small button-quiet" type="button" onClick={resetSession}>重新开始</button>
          </div>
          ) : (
            <div className="interactive-choices"><p className="eyebrow">选择你的行动</p>{scene?.choices.map((choice, index) => <button className="interactive-choice" key={choice.id} ref={index === 0 ? firstChoiceRef : undefined} type="button" disabled={isBusy} onClick={() => void choose(choice.id)}><span className={`interactive-risk interactive-risk-${choice.risk}`}>{choice.risk === "low" ? "低风险" : choice.risk === "medium" ? "中风险" : "高风险"}</span><strong>{choice.label}</strong><small>{choice.consequencePreview}</small></button>)}</div>
          )}
          {visibleTurns.length > 0 ? <section className="interactive-timeline" aria-labelledby="interactive-timeline-title">
             <p className="eyebrow" id="interactive-timeline-title">WRITTEN PATH</p>
             <ol>{visibleTurns.map((turn) => <li key={turn.turn}><span>第 {turn.turn} 幕</span><strong>{turn.scene.title}</strong><small>{turn.selectedChoiceLabel ? `作者选择：${turn.selectedChoiceLabel}` : "等待作者选择"}</small></li>)}</ol>
          </section> : null}
          <div className="interactive-footer-actions">
            <a className="text-link" href={`/api/projects/${projectId}/play/${encodeURIComponent(session.id)}/export?format=markdown`}>导出 Markdown</a>
            <a className="text-link" href={`/api/projects/${projectId}/play/${encodeURIComponent(session.id)}/export?format=json`}>导出 JSON</a>
          </div>
        </section>
      )}
      {historyError ? <p className="interactive-error" role="alert">{historyError}</p> : null}
      {history.length > 0 || historyNextCursor ? (
        <section className="interactive-history" aria-labelledby="interactive-history-title">
          <div className="interactive-history-heading">
            <div>
              <p className="eyebrow">LOCAL WRITING SESSIONS</p>
              <h2 id="interactive-history-title">作者分支写作记录</h2>
            </div>
            <span>{history.length} 条</span>
          </div>
           <div className="interactive-history-list">
            {history.map((item) => (
              <article className="interactive-history-item" key={item.id}>
                <div>
                  <span className="interactive-history-status">{sessionStatusLabel(item.status, item.materializedVersionId, item.lastError)}</span>
                  <strong>{projectTitle}</strong>
                  <small>第 {item.turn} / {item.targetTurns} 幕</small>
                </div>
                <div className="interactive-history-actions">
                  <button className="button button-small button-quiet" type="button" disabled={historyBusyId !== null} aria-label={`恢复${projectTitle}第 ${item.turn} 幕`} onClick={() => void resumeHistorySession(item.id)}>恢复</button>
                  <button className="icon-button icon-button-danger" type="button" disabled={historyBusyId !== null} aria-label={`删除${projectTitle}第 ${item.turn} 幕`} onClick={() => void deleteHistorySession(item.id)}>删除</button>
                </div>
              </article>
             ))}
           </div>
           {historyNextCursor ? <button className="button button-small button-quiet interactive-history-more" type="button" disabled={historyBusyId !== null} onClick={() => void loadMoreHistory()}>{historyBusyId === HISTORY_MORE_ID ? "正在加载…" : "加载更多记录"}</button> : null}
         </section>
      ) : null}
    </main>
  );
}
