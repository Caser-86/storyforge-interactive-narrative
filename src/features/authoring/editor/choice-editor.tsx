"use client";

import { useEffect, useState } from "react";
import type { StoryEdge } from "@/lib/authoring/schemas";
import { patchEdge } from "../authoring-api";
import { createAutosaveController, type AutosaveController, type AutosaveState } from "./autosave";

type ChoiceEditorProps = {
  projectId: string;
  edge: StoryEdge;
  expectedRevision: number;
  onSaved: (edge: StoryEdge, draftRevision: number) => void;
};

const stateLabels: Record<AutosaveState, string> = { idle: "有未保存更改", saving: "保存中…", saved: "已保存", error: "保存失败" };
type ChoiceDraft = { label: string; consequenceSummary: string; branchType: StoryEdge["branchType"] };

export function ChoiceEditor({ projectId, edge, expectedRevision, onSaved }: ChoiceEditorProps) {
  const [draft, setDraft] = useState<ChoiceDraft>({ label: edge.label, consequenceSummary: edge.consequenceSummary, branchType: edge.branchType });
  const [saveState, setSaveState] = useState<AutosaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [controller] = useState<AutosaveController>(() => createAutosaveController({
    save: async (change, revision) => {
      const result = await patchEdge(projectId, edge.id, change, revision);
      setDraft((current) => mergeSavedEdge(current, change, result.edge));
      setSaveError(null);
      onSaved(result.edge, result.draftRevision);
      return { nextRevision: result.draftRevision };
    },
    onStateChange: (state, error) => { setSaveState(state); if (error) setSaveError(error.message); },
  }));

  useEffect(() => () => controller.cancel(), [controller]);

  function update(field: "label" | "consequenceSummary" | "branchType", value: string) {
    setDraft((current) => {
      if (field === "branchType") return { ...current, branchType: value as StoryEdge["branchType"] };
      return { ...current, [field]: value };
    });
    setSaveError(null);
    controller.schedule({ [field]: value }, expectedRevision);
  }

  return <div className="choice-editor"><div className="choice-editor-state"><span>{stateLabels[saveState]}</span>{saveError ? <span className="choice-editor-error" role="alert">{saveError}</span> : null}</div><label htmlFor={`choice-label-${edge.id}`}>选择文案<input id={`choice-label-${edge.id}`} value={draft.label} onChange={(event) => update("label", event.target.value)} onBlur={() => void controller.flush()} /></label><label htmlFor={`choice-consequence-${edge.id}`}>结果提示<input id={`choice-consequence-${edge.id}`} value={draft.consequenceSummary} onChange={(event) => update("consequenceSummary", event.target.value)} onBlur={() => void controller.flush()} /></label><label htmlFor={`choice-branch-${edge.id}`}>分支类型<select id={`choice-branch-${edge.id}`} value={draft.branchType} onChange={(event) => update("branchType", event.target.value)} onBlur={() => void controller.flush()}><option value="main">主线</option><option value="side">支线</option></select></label></div>;
}

function mergeSavedEdge(draft: ChoiceDraft, change: Record<string, string>, edge: StoryEdge): ChoiceDraft {
  const nextDraft = { ...draft };
  if (change.label !== undefined && draft.label === change.label) nextDraft.label = edge.label;
  if (change.consequenceSummary !== undefined && draft.consequenceSummary === change.consequenceSummary) nextDraft.consequenceSummary = edge.consequenceSummary;
  if (change.branchType !== undefined && draft.branchType === change.branchType) nextDraft.branchType = edge.branchType;
  return nextDraft;
}
