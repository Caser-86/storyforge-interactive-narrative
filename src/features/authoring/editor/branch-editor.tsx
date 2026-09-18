"use client";

import { useState } from "react";
import type { StoryGraph, StoryNode, ValidationIssue } from "@/lib/authoring/schemas";
import { addAuthorBranch, type AuthorBranchDraft } from "@/lib/authoring/graph-branch";
import { putGraph } from "../authoring-api";

type BranchFormValues = Omit<AuthorBranchDraft, "sourceNodeId">;

type BranchEditorProps = {
  projectId: string;
  graph: StoryGraph;
  sourceNode: StoryNode;
  expectedRevision: number;
  maxNodes: number;
  onSaved: (graph: StoryGraph, draftRevision: number, issues: ValidationIssue[], newNodeId: string) => void;
};

const defaultValues: Omit<BranchFormValues, "endingNodeId"> = {
  choiceLabel: "",
  intent: "作者补充分支",
  consequenceSummary: "这条分支将根据作者选择进入指定结局。",
  continuationLabel: "继续前进",
  title: "",
  body: "",
  summary: "",
  objective: "",
};

export function BranchEditor({ projectId, graph, sourceNode, expectedRevision, maxNodes, onSaved }: BranchEditorProps) {
  const endings = graph.nodes.filter((node) => node.kind === "ending");
  const sourceEdges = graph.edges.filter((edge) => edge.sourceNodeId === sourceNode.id);
  const canAdd = sourceNode.kind !== "ending" && sourceEdges.some((edge) => edge.branchType === "main") && endings.length > 0 && graph.nodes.length < maxNodes;
  const [draft, setDraft] = useState<BranchFormValues>(() => ({
    ...defaultValues,
    endingNodeId: endings[0]?.id ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function update(field: keyof BranchFormValues, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveError(null);
    setSaveMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const nextGraph = addAuthorBranch(
        graph,
        { ...draft, sourceNodeId: sourceNode.id },
        { createId: createBrowserId, now: new Date().toISOString() },
      );
      const result = await putGraph(projectId, nextGraph, expectedRevision);
      const newNode = nextGraph.nodes[nextGraph.nodes.length - 1];
      if (!newNode) throw new Error("The new branch node was not created.");

      onSaved(result.graph, result.draftRevision ?? expectedRevision + 1, result.issues, newNode.id);
      setSaveMessage("已保存作者分支，已切换到新节点。");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存作者分支失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="branch-editor" aria-labelledby="branch-editor-title">
      <div className="branch-editor-heading">
        <div><p className="eyebrow">AUTHOR BRANCH</p><h3 id="branch-editor-title">新增作者分支</h3></div>
        <span>一次保存一条</span>
      </div>
      {sourceNode.kind === "ending" ? <p className="branch-editor-note">结局节点不能继续新增分支。</p> : null}
      {sourceNode.kind !== "ending" && sourceEdges.every((edge) => edge.branchType !== "main") ? <p className="branch-editor-note">只有已有主线的节点才能新增支线。</p> : null}
      {sourceNode.kind !== "ending" && endings.length === 0 ? <p className="branch-editor-note">当前图谱没有可连接的结局，暂时不能新增分支。</p> : null}
      {sourceNode.kind !== "ending" && graph.nodes.length >= maxNodes ? <p className="branch-editor-note">已达到项目节点上限 {maxNodes}，请先调整项目规模。</p> : null}
      {canAdd ? (
        <form className="branch-editor-form" onSubmit={handleSubmit}>
          {saveError ? <p className="branch-editor-error" role="alert">{saveError}</p> : null}
          {saveMessage ? <p className="branch-editor-success" role="status">{saveMessage}</p> : null}
          <label className="branch-editor-field" htmlFor="branch-choice-label"><span>选择文案</span><input id="branch-choice-label" required maxLength={240} value={draft.choiceLabel} onChange={(event) => update("choiceLabel", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-intent"><span>分支意图</span><input id="branch-intent" required maxLength={600} value={draft.intent} onChange={(event) => update("intent", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-consequence"><span>后果摘要</span><textarea id="branch-consequence" required maxLength={800} rows={2} value={draft.consequenceSummary} onChange={(event) => update("consequenceSummary", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-title"><span>新节点标题</span><input id="branch-title" required maxLength={200} value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-body"><span>新节点正文</span><textarea id="branch-body" required maxLength={12_000} rows={7} value={draft.body} onChange={(event) => update("body", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-summary"><span>新节点摘要</span><textarea id="branch-summary" required maxLength={600} rows={2} value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-objective"><span>新节点目标</span><input id="branch-objective" required maxLength={600} value={draft.objective} onChange={(event) => update("objective", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-continuation"><span>收束选择文案</span><input id="branch-continuation" required maxLength={240} value={draft.continuationLabel} onChange={(event) => update("continuationLabel", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="branch-ending"><span>收束到结局</span><select id="branch-ending" required value={draft.endingNodeId} onChange={(event) => update("endingNodeId", event.target.value)}>{endings.map((ending) => <option key={ending.id} value={ending.id}>{ending.title} · {ending.nodeKey}</option>)}</select></label>
          <button className="button button-small button-primary branch-editor-submit" type="submit" disabled={saving}>{saving ? "保存中…" : "保存作者分支"}</button>
        </form>
      ) : null}
    </section>
  );
}

function createBrowserId(kind: "node" | "edge"): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("当前环境不支持安全 ID 生成。");
  }
  return `${kind}-${globalThis.crypto.randomUUID()}`;
}
