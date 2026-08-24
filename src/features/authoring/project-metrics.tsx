"use client";

import { useEffect, useState } from "react";
import { ProjectGenerationMetricsSchema } from "@/lib/authoring/metrics-contracts";

type ProjectMetricsProps = { projectId: string };

export function ProjectMetrics({ projectId }: ProjectMetricsProps) {
  const [metrics, setMetrics] = useState<ReturnType<typeof ProjectGenerationMetricsSchema.parse> | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectId}/metrics`)
      .then(async (response) => {
        if (!response.ok) throw new Error("metrics request failed");
        return ProjectGenerationMetricsSchema.parse(await response.json());
      })
      .then((value) => { if (active) setMetrics(value); })
      .catch(() => { if (active) setMetrics(null); });
    return () => { active = false; };
  }, [projectId]);

  if (!metrics) return <p className="inspector-muted">生成指标暂不可用。</p>;
  const nodeLatency = metrics.stageLatencyMs.nodes;

  return (
    <section className="project-metrics" aria-label="生成指标">
      <div className="quality-panel-heading"><div><p className="eyebrow">LOCAL METRICS</p><h3>生成指标</h3></div><span>{metrics.totalCalls} calls</span></div>
      <div className="release-checklist-stats">
        <span>输入 {metrics.totalInputTokens.toLocaleString()} tokens</span>
        <span>输出 {metrics.totalOutputTokens.toLocaleString()} tokens</span>
        <span>失败 {metrics.failedRuns} · 重试 {metrics.totalRetries}</span>
        <span>节点耗时 P50/P95 {nodeLatency ? `${nodeLatency.p50}/${nodeLatency.p95} ms` : "暂无"}</span>
        <span>{metrics.estimatedCost === null ? "成本估算未配置价格" : `估算成本 $${metrics.estimatedCost.toFixed(4)}（非账单）`}</span>
      </div>
    </section>
  );
}
