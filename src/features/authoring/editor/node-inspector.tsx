"use client";

import { useState } from "react";
import type { GenerationCandidate } from "@/lib/authoring/generation/schemas";
import type { StoryNode } from "@/lib/authoring/schemas";
import { applyCandidate, regenerateNode, rejectCandidate } from "../authoring-api";
import { CandidateDiff } from "./candidate-diff";

type NodeInspectorProps = {
  projectId: string;
  node: StoryNode;
  onApplied: (node: StoryNode) => void;
};

export function NodeInspector({ projectId, node, onApplied }: NodeInspectorProps) {
  const [candidate, setCandidate] = useState<GenerationCandidate | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setIsPending(true);
    setError(null);
    try {
      setCandidate(await regenerateNode(projectId, node.id, node.contentRevision));
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : "候选生成失败");
    } finally {
      setIsPending(false);
    }
  }

  async function apply() {
    if (!candidate) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await applyCandidate(projectId, candidate.id, node.contentRevision);
      onApplied(result.node);
      setCandidate(null);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "候选应用失败，可能已经过期");
    } finally {
      setIsPending(false);
    }
  }

  async function reject() {
    if (!candidate) return;
    setIsPending(true);
    try {
      await rejectCandidate(projectId, candidate.id);
      setCandidate(null);
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "候选丢弃失败");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="node-inspector">
      <div className="inspector-node-heading"><p className="eyebrow">SELECTED NODE</p><h3>{node.title}</h3></div>
      <p className="inspector-muted">{node.authorModified ? "该节点包含人工修改，AI 只会生成候选。" : "局部重生成会保留当前正文，等待你审阅后再应用。"}</p>
      {error ? <p className="node-editor-error" role="alert">{error}</p> : null}
      {!candidate ? <button className="button button-small button-quiet inspector-regenerate" type="button" disabled={isPending} onClick={() => void regenerate()}>{isPending ? "生成候选中…" : "局部重生成"}</button> : <CandidateDiff candidate={candidate} currentBody={node.body} isPending={isPending} onApply={() => void apply()} onReject={() => void reject()} />}
    </div>
  );
}
