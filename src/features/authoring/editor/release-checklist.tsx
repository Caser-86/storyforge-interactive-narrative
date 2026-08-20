"use client";

import { useEffect, useState } from "react";
import type { ValidationDecision } from "@/lib/authoring/validation/service";

type ReleaseChecklistProps = { projectId: string; refreshToken?: number };

export function ReleaseChecklist({ projectId, refreshToken = 0 }: ReleaseChecklistProps) {
  const [decision, setDecision] = useState<ValidationDecision | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function runValidation() {
    setIsPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: ["structural", "rule"] }),
      });
      if (!response.ok) throw new Error("发布检查失败");
      setDecision(await response.json() as ValidationDecision);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "发布检查失败");
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    let canceled = false;
    void fetch(`/api/projects/${projectId}/validate`)
      .then(async (response) => {
        if (!response.ok) throw new Error("发布检查失败");
        return response.json() as Promise<ValidationDecision>;
      })
      .then((payload) => { if (!canceled) setDecision(payload); })
      .catch((loadError) => { if (!canceled) setError(loadError instanceof Error ? loadError.message : "发布检查失败"); })
      .finally(() => { if (!canceled) setIsPending(false); });
    return () => { canceled = true; };
  }, [projectId, refreshToken]);

  return (
    <section className="release-checklist" aria-label="发布检查清单">
      <div className="quality-panel-heading"><div><p className="eyebrow">RELEASE GATE</p><h3>发布检查</h3></div><span className={decision?.allowed ? "release-ready" : "release-blocked"}>{decision?.allowed ? "READY" : "HOLD"}</span></div>
      {isPending && !decision ? <p className="inspector-muted">正在读取当前修订…</p> : null}
      {decision ? <><p className={decision.allowed ? "release-status release-status-ready" : "release-status release-status-blocked"}>{decision.allowed ? "可以发布" : "暂不可发布"}</p><div className="release-checklist-stats"><span>修订 {decision.validationRevision === null ? "未验证" : `${decision.validationRevision} 已验证`}</span><span>{decision.blocking.length} 个阻断 · {decision.warnings.length} 个 warning</span></div></> : null}
      {error ? <p className="node-editor-error" role="alert">{error}</p> : null}
      <button className="button button-small button-quiet inspector-regenerate" type="button" disabled={isPending} onClick={() => void runValidation()}>{isPending ? "检查中…" : "重新运行质量检查"}</button>
    </section>
  );
}
