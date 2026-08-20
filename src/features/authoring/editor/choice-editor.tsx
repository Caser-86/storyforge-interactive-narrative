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

export function ChoiceEditor({ projectId, edge, expectedRevision, onSaved }: ChoiceEditorProps) {
  const [draft, setDraft] = useState({ label: edge.label, consequenceSummary: edge.consequenceSummary });
  const [saveState, setSaveState] = useState<AutosaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [controller] = useState<AutosaveController>(() => createAutosaveController({
    save: async (change, revision) => {
      const result = await patchEdge(projectId, edge.id, change, revision);
      setDraft({ label: result.edge.label, consequenceSummary: result.edge.consequenceSummary });
      setSaveError(null);
      onSaved(result.edge, result.draftRevision);
    },
    onStateChange: (state, error) => { setSaveState(state); if (error) setSaveError(error.message); },
  }));

  useEffect(() => () => controller.cancel(), [controller]);

  function update(field: "label" | "consequenceSummary", value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveError(null);
    controller.schedule({ [field]: value }, expectedRevision);
  }

  return <div className="choice-editor"><div className="choice-editor-state"><span>{stateLabels[saveState]}</span>{saveError ? <span className="choice-editor-error" role="alert">{saveError}</span> : null}</div><label htmlFor={`choice-label-${edge.id}`}>选择文案<input id={`choice-label-${edge.id}`} value={draft.label} onChange={(event) => update("label", event.target.value)} onBlur={() => void controller.flush()} /></label><label htmlFor={`choice-consequence-${edge.id}`}>结果提示<input id={`choice-consequence-${edge.id}`} value={draft.consequenceSummary} onChange={(event) => update("consequenceSummary", event.target.value)} onBlur={() => void controller.flush()} /></label></div>;
}
