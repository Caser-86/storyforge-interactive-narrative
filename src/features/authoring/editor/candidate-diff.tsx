"use client";

import type { GenerationCandidate } from "@/lib/authoring/generation/schemas";

type CandidateDiffProps = {
  candidate: GenerationCandidate;
  currentBody: string;
  isPending: boolean;
  onApply: () => void;
  onReject: () => void;
};

export function CandidateDiff({ candidate, currentBody, isPending, onApply, onReject }: CandidateDiffProps) {
  return (
    <section className="candidate-diff" aria-label="AI 候选对比">
      <div className="candidate-diff-heading"><p className="eyebrow">AI CANDIDATE / REVIEW</p><span>{candidate.model ?? "本地模型"}</span></div>
      <div className="candidate-column candidate-old"><span>当前正文</span><p>{currentBody}</p></div>
      <div className="candidate-column candidate-new"><span>候选正文</span><p>{candidate.candidateBody}</p></div>
      <div className="candidate-actions">
        <button className="button button-small button-primary" type="button" disabled={isPending} onClick={onApply}>{isPending ? "应用中…" : "应用候选"}</button>
        <button className="icon-button" type="button" disabled={isPending} onClick={onReject}>丢弃</button>
      </div>
    </section>
  );
}
