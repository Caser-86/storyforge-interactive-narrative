"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { InteractiveSession } from "@/lib/interactive/schemas";

type InteractivePlayerProps = { projectId: string; projectTitle: string };

function sessionStatusLabel(status: InteractiveSession["status"], materializedVersionId: string | null): string {
  if (materializedVersionId) return "已落稿";
  return status === "ended" ? "已结束" : status === "active" ? "进行中" : status === "generating" ? "生成中" : "失败";
}

export function InteractivePlayer({ projectId, projectTitle }: InteractivePlayerProps) {
  const [session, setSession] = useState<InteractiveSession | null>(null);
  const [history, setHistory] = useState<InteractiveSession[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const deletedHistoryIdsRef = useRef(new Set<string>());
  const storageKey = `storyforge:interactive-session:${projectId}`;

  useEffect(() => {
    let canceled = false;
    const savedSessionId = window.localStorage.getItem(storageKey);

    if (!savedSessionId) {
      return () => {
        canceled = true;
      };
    }

    void fetch(`/api/projects/${projectId}/play/${encodeURIComponent(savedSessionId)}`)
      .then(async (response) => {
        const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
        if (response.status === 404 || payload.session?.status === "failed") {
          window.localStorage.removeItem(storageKey);
          return;
        }
        if (!response.ok || !payload.session) {
          throw new Error(payload.error?.message ?? "互动进度恢复失败");
        }
        if (!canceled) {
          setError(null);
          setSession(payload.session);
        }
      })
      .catch((restoreError) => {
        if (!canceled) setError(restoreError instanceof Error ? restoreError.message : "互动进度恢复失败");
      });

    return () => {
      canceled = true;
    };
  }, [projectId, storageKey]);

  const generatingSessionId = session?.status === "generating" ? session.id : null;

  useEffect(() => {
    if (!generatingSessionId) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (canceled) return;
      try {
        const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(generatingSessionId)}`);
        const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
        if (response.status === 404 || payload.session?.status === "failed") {
          window.localStorage.removeItem(storageKey);
          if (!canceled) {
            setSession(null);
            setError(payload.error?.message ?? "互动进度已失效，请重新开始");
          }
          return;
        }
        if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "互动进度恢复失败");
        if (canceled) return;
        setError(null);
        setSession(payload.session);
        if (payload.session.status === "generating") timer = setTimeout(() => void poll(), 1000);
      } catch (pollError) {
        if (!canceled) {
          setError(pollError instanceof Error ? pollError.message : "互动进度恢复失败");
          timer = setTimeout(() => void poll(), 1500);
        }
      }
    };

    timer = setTimeout(() => void poll(), 750);
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, generatingSessionId, storageKey]);

  useEffect(() => {
    let canceled = false;
    void fetch(`/api/projects/${projectId}/play/sessions`)
      .then(async (response) => {
        const payload = await response.json() as { sessions?: InteractiveSession[]; error?: { message?: string } };
        if (!response.ok || !Array.isArray(payload.sessions)) throw new Error(payload.error?.message ?? "互动记录读取失败");
        if (!canceled) {
          setHistoryError(null);
          setHistory(payload.sessions.filter((item) => !deletedHistoryIdsRef.current.has(item.id)));
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
      const payload = await response.json() as { sessions?: InteractiveSession[]; error?: { message?: string } };
      if (!response.ok || !Array.isArray(payload.sessions)) throw new Error(payload.error?.message ?? "互动记录读取失败");
      setHistoryError(null);
      setHistory(payload.sessions.filter((item) => !deletedHistoryIdsRef.current.has(item.id)));
    } catch (historyLoadError) {
      setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : "互动记录读取失败");
    }
  }

  function activateSession(nextSession: InteractiveSession): void {
    setSession(nextSession);
    window.localStorage.setItem(storageKey, nextSession.id);
  }

  async function start() {
    if (window.localStorage.getItem(storageKey) && !error) {
      setError("正在恢复互动进度，请稍候…");
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play`, { method: "POST" });
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "开场生成失败");
      activateSession(payload.session);
      void refreshHistory();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "开场生成失败");
    } finally {
      setIsBusy(false);
    }
  }

  async function choose(choiceId: string) {
    if (!session || session.status !== "active" || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${session.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choiceId }),
      });
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "下一段生成失败");
      activateSession(payload.session);
      void refreshHistory();
    } catch (choiceError) {
      setError(choiceError instanceof Error ? choiceError.message : "下一段生成失败");
    } finally {
      setIsBusy(false);
    }
  }

  async function materialize() {
    if (!session || session.status !== "ended" || session.materializedVersionId || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(session.id)}/materialize`, { method: "POST" });
      const payload = await response.json() as { version?: { id: string }; error?: { message?: string } };
      if (!response.ok || !payload.version) throw new Error(payload.error?.message ?? "正式故事草稿保存失败");
      setSession((current) => current ? { ...current, materializedVersionId: payload.version!.id } : current);
      void refreshHistory();
    } catch (materializeError) {
      setError(materializeError instanceof Error ? materializeError.message : "正式故事草稿保存失败");
    } finally {
      setIsBusy(false);
    }
  }

  async function resumeHistorySession(sessionId: string): Promise<void> {
    setHistoryBusyId(sessionId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/${encodeURIComponent(sessionId)}`);
      const payload = await response.json() as { session?: InteractiveSession; error?: { message?: string } };
      if (!response.ok || !payload.session) throw new Error(payload.error?.message ?? "互动记录恢复失败");
      activateSession(payload.session);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "互动记录恢复失败");
    } finally {
      setHistoryBusyId(null);
    }
  }

  async function deleteHistorySession(sessionId: string): Promise<void> {
    if (!window.confirm("确定删除这条互动记录吗？此操作无法撤销。")) return;
    setHistoryBusyId(sessionId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/play/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      const payload = response.status === 204 ? null : await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload?.error?.message ?? "互动记录删除失败");
      deletedHistoryIdsRef.current.add(sessionId);
      setHistory((current) => current.filter((item) => item.id !== sessionId));
      if (window.localStorage.getItem(storageKey) === sessionId) {
        window.localStorage.removeItem(storageKey);
        setSession(null);
      }
    } catch (deleteError) {
      setHistoryError(deleteError instanceof Error ? deleteError.message : "互动记录删除失败");
    } finally {
      setHistoryBusyId(null);
    }
  }

  const scene = session?.scene;
  return (
    <main className="interactive-page">
      <header className="interactive-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">SF</span>
          <div><p className="eyebrow">BRANCH WRITING / CONFIGURED MODEL</p><p className="brand-name">{projectTitle}</p></div>
        </div>
        <div className="interactive-header-actions">
          <Link className="text-link" href={`/projects/${projectId}/edit`}>返回编辑器</Link>
          <span className="preview-readonly">作者选择推进</span>
        </div>
      </header>

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
          <div className="interactive-progress"><span>第 {session.state.turn} / {session.state.targetTurns} 幕</span><span>{session.status === "ended" ? "故事已结束" : session.status === "generating" ? "正在恢复上一段生成…" : isBusy ? "正在根据你的选择生成…" : "等待选择"}</span></div>
          {scene ? <article className="interactive-scene">
            <p className="eyebrow">{scene.isEnding ? "ENDING" : `SCENE ${String(session.state.turn).padStart(2, "0")}`}</p>
            <h1>{scene.title}</h1>
            <div className="interactive-body">{scene.body.split(/\n\s*\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
            <p className="interactive-summary">{scene.summary}</p>
          </article> : null}
          {error ? <p className="interactive-error" role="alert">{error}</p> : null}
          {session.status === "generating" ? (
          <p className="interactive-error" role="status">上一段生成尚未完成，正在自动恢复，请稍候</p>
          ) : session.status === "ended" || scene?.isEnding ? (
          <div className="interactive-ending">
            <strong>{scene?.endingSummary ?? "本次分支写作已收束。"}</strong>
            {session.materializedVersionId ? <div className="interactive-draft-saved"><span>已保存为正式故事草稿</span><Link className="text-link" href={`/projects/${projectId}/edit`}>进入编辑器</Link></div> : <button className="button button-primary button-small" type="button" disabled={isBusy} onClick={() => void materialize()}>{isBusy ? "正在保存草稿…" : "保存为正式故事草稿"}</button>}
            <button className="button button-small button-quiet" type="button" onClick={() => { setSession(null); setError(null); window.localStorage.removeItem(storageKey); }}>重新开始</button>
          </div>
          ) : (
            <div className="interactive-choices"><p className="eyebrow">选择你的行动</p>{scene?.choices.map((choice) => <button className="interactive-choice" key={choice.id} type="button" disabled={isBusy} onClick={() => void choose(choice.id)}><span className={`interactive-risk interactive-risk-${choice.risk}`}>{choice.risk === "low" ? "低风险" : choice.risk === "medium" ? "中风险" : "高风险"}</span><strong>{choice.label}</strong><small>{choice.consequencePreview}</small></button>)}</div>
          )}
          <div className="interactive-footer-actions">
            <a className="text-link" href={`/api/projects/${projectId}/play/${encodeURIComponent(session.id)}/export?format=markdown`}>导出 Markdown</a>
            <a className="text-link" href={`/api/projects/${projectId}/play/${encodeURIComponent(session.id)}/export?format=json`}>导出 JSON</a>
          </div>
        </section>
      )}
      {historyError ? <p className="interactive-error" role="alert">{historyError}</p> : null}
      {history.length > 0 ? (
        <section className="interactive-history" aria-labelledby="interactive-history-title">
          <div className="interactive-history-heading">
            <div>
              <p className="eyebrow">LOCAL WRITING SESSIONS</p>
              <h2 id="interactive-history-title">分支写作记录</h2>
            </div>
            <span>{history.length} 条</span>
          </div>
          <div className="interactive-history-list">
            {history.map((item) => (
              <article className="interactive-history-item" key={item.id}>
                <div>
                  <span className="interactive-history-status">{sessionStatusLabel(item.status, item.materializedVersionId)}</span>
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
        </section>
      ) : null}
    </main>
  );
}
