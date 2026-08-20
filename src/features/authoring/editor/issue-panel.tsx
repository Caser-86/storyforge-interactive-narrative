"use client";

import { useEffect, useState } from "react";
import type { ValidationIssueRecord } from "@/lib/authoring/validation/schemas";

type IssueFilter = "all" | "blocking" | "warning";

type IssuePanelProps = {
  projectId: string;
  initialIssues?: ValidationIssueRecord[];
  onSelectNode: (nodeId: string) => void;
  refreshToken?: number;
};

export function IssuePanel({ projectId, initialIssues = [], onSelectNode, refreshToken = 0 }: IssuePanelProps) {
  const [issues, setIssues] = useState(initialIssues);
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    void fetch(`/api/projects/${projectId}/validate`)
      .then(async (response) => {
        if (!response.ok) throw new Error("质量问题加载失败");
        return response.json() as Promise<{ issues?: ValidationIssueRecord[]; blocking?: ValidationIssueRecord[]; warnings?: ValidationIssueRecord[] }>;
      })
      .then((payload) => {
        if (canceled) return;
        setIssues(payload.issues ?? [...(payload.blocking ?? []), ...(payload.warnings ?? [])]);
      })
      .catch((loadError) => {
        if (!canceled) setError(loadError instanceof Error ? loadError.message : "质量问题加载失败");
      });
    return () => { canceled = true; };
  }, [projectId, refreshToken]);

  const visibleIssues = issues.filter((issue) => issue.status === "open" && (filter === "all" || issue.severity === filter));

  async function updateIssue(issue: ValidationIssueRecord, action: "resolve" | "dismiss") {
    if (action === "dismiss" && !window.confirm("确认忽略这个 warning？它不会再阻止发布，但证据会保留在历史记录中。")) return;
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/validation/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("质量问题处理失败");
      setIssues((current) => current.map((candidate) => candidate.id === issue.id ? { ...candidate, status: action === "dismiss" ? "dismissed" : "resolved" } : candidate));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "质量问题处理失败");
    }
  }

  return (
    <section className="quality-panel" aria-label="质量问题">
      <div className="quality-panel-heading"><div><p className="eyebrow">QUALITY LOOP</p><h3>质量问题</h3></div><span>{visibleIssues.length}</span></div>
      <div className="quality-filters" role="group" aria-label="问题筛选">
        {(["all", "blocking", "warning"] as IssueFilter[]).map((value) => <button className={filter === value ? "quality-filter quality-filter-active" : "quality-filter"} key={value} type="button" onClick={() => setFilter(value)}>{value === "all" ? "全部" : value === "blocking" ? "阻断" : "Warning"}</button>)}
      </div>
      {error ? <p className="node-editor-error" role="alert">{error}</p> : null}
      {visibleIssues.length === 0 ? <p className="inspector-muted">当前修订没有未处理问题。</p> : <ul className="quality-issue-list">{visibleIssues.map((issue) => <li className={`quality-issue quality-issue-${issue.severity}`} key={issue.id}><div className="quality-issue-meta"><strong>{issue.code}</strong><span>{issue.source === "ai_review" ? "AI warning" : issue.severity === "blocking" ? "阻断" : "规则 warning"}</span></div><p>{issue.message}</p>{issue.nodeId ? <button className="quality-link-button" type="button" onClick={() => onSelectNode(issue.nodeId!)}>定位到节点</button> : null}<div className="quality-issue-actions">{issue.severity === "warning" ? <button className="quality-link-button" type="button" onClick={() => void updateIssue(issue, "dismiss")}>忽略 warning</button> : null}<button className="quality-link-button" type="button" onClick={() => void updateIssue(issue, "resolve")}>标记已处理</button></div></li>)}</ul>}
    </section>
  );
}
