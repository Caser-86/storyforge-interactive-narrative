"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerationStatusResponse } from "@/lib/authoring/generation/api-contracts";
import type { GenerationRun } from "@/lib/authoring/generation/schemas";
import {
  advanceGeneration,
  createGenerationRun,
  generationAction,
  getGenerationStatus,
  listGenerationRuns,
} from "./authoring-api";

type GenerationProgressProps = {
  projectId: string;
  projectTitle: string;
};

type GenerationStepSummary = GenerationStatusResponse["steps"][number];

const stageLabels: Record<GenerationRun["stage"], string> = {
  brief: "项目简报",
  bible: "故事圣经",
  outline: "章节大纲",
  graph: "故事结构",
  structural_check: "结构校验",
  nodes: "节点内容",
  continuity_review: "连续性审阅",
  ready: "准备完成",
};

const stepStatusLabels: Record<GenerationStepSummary["status"], string> = {
  queued: "等待中",
  running: "处理中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

function latestRun(runs: GenerationRun[]): GenerationRun | undefined {
  return [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function isAdvancing(status: GenerationRun["status"]): boolean {
  return status === "queued" || status === "running";
}

export function GenerationProgress({ projectId, projectTitle }: GenerationProgressProps) {
  const router = useRouter();
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [steps, setSteps] = useState<GenerationStepSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionPending, setIsActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancing = useRef(false);

  async function syncStatus(currentRun: GenerationRun) {
    const status = await getGenerationStatus(projectId, currentRun.id);
    setRun(status.run);
    setSteps(status.steps);
    return status.run;
  }

  async function loadRun() {
    setIsLoading(true);
    setError(null);
    try {
      const existing = latestRun(await listGenerationRuns(projectId));
      const current = existing ?? (await createGenerationRun(projectId));
      await syncStatus(current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取生成进度");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    const timer = setTimeout(() => {
      void loadRun().catch(() => {
        if (!disposed) setError("无法读取生成进度");
      });
    }, 0);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
    // The project ID is stable for this page; reload is intentionally one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!run || !isAdvancing(run.status) || isLoading) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (disposed || advancing.current) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => void tick(), 1000);
        return;
      }

      advancing.current = true;
      try {
        const result = await advanceGeneration(projectId, run.id);
        if (disposed) return;
        setRun(result.run);
        await syncStatus(result.run);
      } catch (advanceError) {
        if (!disposed) setError(advanceError instanceof Error ? advanceError.message : "生成推进失败");
      } finally {
        advancing.current = false;
      }
    };

    timer = setTimeout(() => void tick(), 350);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
    // The run status is the persisted resume cursor for this loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, run?.id, run?.status, isLoading]);

  async function handleAction(action: "pause" | "resume" | "cancel") {
    if (!run) return;
    setIsActionPending(true);
    setError(null);
    try {
      const nextRun = await generationAction(projectId, run.id, action);
      await syncStatus(nextRun);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally {
      setIsActionPending(false);
    }
  }

  if (isLoading && !run) {
    return <div className="generation-loading">正在读取生成进度…</div>;
  }

  if (!run) {
    return (
      <div className="generation-error" role="alert">
        <strong>生成流程暂时不可用</strong>
        <span>{error ?? "请稍后重试。"}</span>
        <button className="button button-primary button-small" type="button" onClick={() => void loadRun()}>重试读取</button>
      </div>
    );
  }

  const percentage = run.progressTotal === 0 ? 0 : Math.min(100, Math.round((run.progressCurrent / run.progressTotal) * 100));
  const authPaused = run.status === "paused" && run.lastErrorCode === "AUTH";
  const failed = run.status === "failed";
  const statusLabel = run.status === "completed"
    ? "生成完成"
    : run.status === "paused"
      ? "生成已暂停"
      : run.status === "failed"
        ? "生成失败"
        : run.status === "canceled"
          ? "已取消"
          : run.progressCurrent === 0
            ? "准备生成"
            : "生成中";

  return (
    <section className="generation-progress" aria-labelledby="generation-title">
      <div className="generation-header">
        <div>
          <p className="eyebrow">GENERATION RUN / {run.id.slice(0, 8)}</p>
          <h1 id="generation-title">正在整理「{projectTitle}」</h1>
          <p>每一步都会保存到本地。你可以离开页面，回来后从同一个进度继续。</p>
        </div>
        <span className={`generation-status generation-status-${run.status}`}>
          {statusLabel}
        </span>
      </div>

      {error ? <div className="generation-alert" role="alert">{error}</div> : null}
      {authPaused ? (
        <div className="generation-alert generation-alert-auth" role="alert">
          <strong>需要检查模型凭证</strong>
          <span>{run.lastErrorMessage ?? "模型服务拒绝了本次请求，请检查本地环境配置。"}</span>
        </div>
      ) : null}
      {failed ? (
        <div className="generation-alert" role="alert">
          <strong>这一步没有完成</strong>
          <span>{run.lastErrorMessage ?? "可以修正配置后重新尝试。"}</span>
        </div>
      ) : null}

      <div className="generation-summary">
        <div className="generation-stage-label">
          <span className="eyebrow">CURRENT STAGE</span>
          <strong>{stageLabels[run.stage]}</strong>
        </div>
        <div className="generation-count" aria-label={`${run.progressCurrent} / ${run.progressTotal}`}><strong>{run.progressCurrent}</strong><span> / {run.progressTotal} 步</span></div>
      </div>
      <div className="generation-meter" aria-label={`生成进度 ${percentage}%`}>
        <span style={{ width: `${percentage}%` }} />
      </div>

      <div className="generation-worklist">
        <div className="worklist-heading"><span>执行记录</span><span>{percentage}%</span></div>
        {steps.length === 0 ? (
          <p className="worklist-empty">正在建立第一条执行记录…</p>
        ) : (
          steps.map((step) => (
            <div className="generation-step" key={step.id}>
              <span className={`step-dot step-dot-${step.status}`} aria-hidden="true" />
              <span className="generation-step-name">{stageLabels[step.stage]}{step.subjectId ? ` · ${step.subjectId.slice(0, 8)}` : ""}</span>
              <span className="generation-step-status">{stepStatusLabels[step.status]}</span>
            </div>
          ))
        )}
      </div>

      <div className="generation-controls">
        {run.status === "completed" ? (
          <button className="button button-primary" type="button" onClick={() => router.push(`/projects/${projectId}/edit`)}>进入编辑器 <span aria-hidden="true">→</span></button>
        ) : null}
        {isAdvancing(run.status) ? (
          <button className="button button-quiet" type="button" disabled={isActionPending} onClick={() => void handleAction("pause")}>暂停生成</button>
        ) : null}
        {run.status === "paused" || run.status === "failed" ? (
          <button className="button button-primary" type="button" disabled={isActionPending} onClick={() => void handleAction("resume")}>
            {failed ? "重新尝试" : "继续生成"}
          </button>
        ) : null}
        {run.status !== "completed" && run.status !== "canceled" ? (
          <button className="text-link generation-cancel" type="button" disabled={isActionPending} onClick={() => void handleAction("cancel")}>取消流程</button>
        ) : null}
        <Link className="text-link" href="/">返回项目库</Link>
      </div>
    </section>
  );
}
