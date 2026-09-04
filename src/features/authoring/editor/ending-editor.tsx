"use client";

import { useState } from "react";
import type { StoryGraph, StoryNode, ValidationIssue } from "@/lib/authoring/schemas";
import { addAuthorEnding, type AuthorEndingDraft } from "@/lib/authoring/graph-branch";
import { putGraph } from "../authoring-api";

type EndingFormValues = Omit<AuthorEndingDraft, "sourceNodeId">;

type EndingEditorProps = {
  projectId: string;
  graph: StoryGraph;
  sourceNode: StoryNode;
  expectedRevision: number;
  maxNodes: number;
  maxEndings: number;
  onSaved: (graph: StoryGraph, draftRevision: number, issues: ValidationIssue[], newNodeId: string) => void;
};

const defaultValues: EndingFormValues = {
  choiceLabel: "",
  intent: "作者补充结局",
  consequenceSummary: "这条分支将根据作者选择进入新的结局。",
  title: "",
  body: "",
  summary: "",
  objective: "",
};

export function EndingEditor({ projectId, graph, sourceNode, expectedRevision, maxNodes, maxEndings, onSaved }: EndingEditorProps) {
  const endings = graph.nodes.filter((node) => node.kind === "ending");
  const canAdd = sourceNode.kind !== "ending" && graph.nodes.length < maxNodes && endings.length < maxEndings;
  const [draft, setDraft] = useState<EndingFormValues>(defaultValues);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function update(field: keyof EndingFormValues, value: string) {
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
      const nextGraph = addAuthorEnding(
        graph,
        { ...draft, sourceNodeId: sourceNode.id },
        { createId: createBrowserId, now: new Date().toISOString() },
      );
      const result = await putGraph(projectId, nextGraph, expectedRevision);
      const newNode = nextGraph.nodes[nextGraph.nodes.length - 1];
      if (!newNode) throw new Error("The new ending node was not created.");

      onSaved(result.graph, result.draftRevision ?? expectedRevision + 1, result.issues, newNode.id);
      setSaveMessage("已保存作者结局，已切换到新节点。");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存作者结局失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="branch-editor ending-editor" aria-labelledby="ending-editor-title">
      <div className="branch-editor-heading">
        <div><p className="eyebrow">AUTHOR ENDING</p><h3 id="ending-editor-title">新增作者结局</h3></div>
        <span>一次保存一个</span>
      </div>
      {sourceNode.kind === "ending" ? <p className="branch-editor-note">结局节点不能继续新增结局。</p> : null}
      {sourceNode.kind !== "ending" && graph.nodes.length >= maxNodes ? <p className="branch-editor-note">已达到项目节点上限 {maxNodes}，请先调整项目规模。</p> : null}
      {sourceNode.kind !== "ending" && endings.length >= maxEndings ? <p className="branch-editor-note">已达到项目结局上限 {maxEndings}，请先调整项目规模。</p> : null}
      {canAdd ? (
        <form className="branch-editor-form" onSubmit={handleSubmit}>
          {saveError ? <p className="branch-editor-error" role="alert">{saveError}</p> : null}
          {saveMessage ? <p className="branch-editor-success" role="status">{saveMessage}</p> : null}
          <label className="branch-editor-field" htmlFor="ending-choice-label"><span>结局选择文案</span><input id="ending-choice-label" required maxLength={240} value={draft.choiceLabel} onChange={(event) => update("choiceLabel", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="ending-intent"><span>结局意图</span><input id="ending-intent" required maxLength={600} value={draft.intent} onChange={(event) => update("intent", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="ending-consequence"><span>结局后果摘要</span><textarea id="ending-consequence" required maxLength={800} rows={2} value={draft.consequenceSummary} onChange={(event) => update("consequenceSummary", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="ending-title"><span>结局标题</span><input id="ending-title" required maxLength={200} value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="ending-body"><span>结局正文</span><textarea id="ending-body" required maxLength={12_000} rows={7} value={draft.body} onChange={(event) => update("body", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="ending-summary"><span>结局摘要</span><textarea id="ending-summary" required maxLength={600} rows={2} value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></label>
          <label className="branch-editor-field" htmlFor="ending-objective"><span>结局目标</span><input id="ending-objective" required maxLength={600} value={draft.objective} onChange={(event) => update("objective", event.target.value)} /></label>
          <button className="button button-small button-primary branch-editor-submit" type="submit" disabled={saving}>{saving ? "保存中…" : "保存作者结局"}</button>
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
