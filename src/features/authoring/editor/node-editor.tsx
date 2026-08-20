"use client";

import { useEffect, useState } from "react";
import type { StoryNode } from "@/lib/authoring/schemas";
import { patchNode } from "../authoring-api";
import { createAutosaveController, type AutosaveController, type AutosaveState } from "./autosave";

type NodeEditorProps = {
  projectId: string;
  node: StoryNode;
  onSaved?: (node: StoryNode, draftRevision: number) => void;
};

type DraftValues = Pick<StoryNode, "title" | "body" | "summary" | "objective">;

const stateLabels: Record<AutosaveState, string> = {
  idle: "有未保存更改",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

export function NodeEditor({ projectId, node, onSaved }: NodeEditorProps) {
  const [draft, setDraft] = useState<DraftValues>(() => valuesFromNode(node));
  const [revision, setRevision] = useState(node.contentRevision);
  const [saveState, setSaveState] = useState<AutosaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [controller] = useState<AutosaveController>(() =>
    createAutosaveController({
      save: async (change, expectedRevision) => {
        const result = await patchNode(projectId, node.id, change, expectedRevision);
        setRevision(result.node.contentRevision);
        setDraft(valuesFromNode(result.node));
        setSaveError(null);
        onSaved?.(result.node, result.draftRevision);
      },
      onStateChange: (state, error) => {
        setSaveState(state);
        if (error) setSaveError(error.message);
      },
    }),
  );

  useEffect(() => () => controller.cancel(), [controller]);

  function update(field: keyof DraftValues, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveError(null);
    controller.schedule({ [field]: value }, revision);
  }

  function flush() {
    void controller.flush().catch(() => undefined);
  }

  return (
    <form className="node-editor-form" onSubmit={(event) => event.preventDefault()}>
      <div className="node-editor-save-state" role="status">
        <span className={`save-dot save-dot-${saveState}`} aria-hidden="true" />
        <span>{stateLabels[saveState]}</span>
        <span className="node-revision">修订 {revision}</span>
      </div>
      {saveError ? <p className="node-editor-error" role="alert">{saveError}</p> : null}
      <label className="node-editor-field" htmlFor="node-title"><span>节点标题</span><input id="node-title" value={draft.title} onChange={(event) => update("title", event.target.value)} onBlur={flush} /></label>
      <label className="node-editor-field" htmlFor="node-objective"><span>本节点目标</span><input id="node-objective" value={draft.objective} onChange={(event) => update("objective", event.target.value)} onBlur={flush} /></label>
      <label className="node-editor-field" htmlFor="node-body"><span>正文</span><textarea id="node-body" rows={12} value={draft.body} onChange={(event) => update("body", event.target.value)} onBlur={flush} /></label>
      <label className="node-editor-field" htmlFor="node-summary"><span>摘要</span><textarea id="node-summary" rows={3} value={draft.summary} onChange={(event) => update("summary", event.target.value)} onBlur={flush} /></label>
      {node.authorModified ? <p className="node-editor-protection">此节点包含人工修改，后续 AI 生成只会产生候选，不会直接覆盖。</p> : null}
    </form>
  );
}

function valuesFromNode(node: StoryNode): DraftValues {
  return { title: node.title, body: node.body, summary: node.summary, objective: node.objective };
}
