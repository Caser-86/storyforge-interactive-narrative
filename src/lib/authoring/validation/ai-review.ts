import { STAGE_SYSTEM_PROMPT } from "../generation/prompts";
import type { GenerationProvider, ProviderResult } from "../generation/provider";
import type { ValidationIssueInput } from "./schemas";
import { AiReviewOutputSchema, type AiReviewOutput } from "./ai-review-schema";

export interface AiReviewNode {
  nodeId: string;
  title: string;
  body: string;
  summary: string;
}

export interface AiReviewChapter {
  chapterId: string;
  title: string;
  summary: string;
  nodes: AiReviewNode[];
}

export interface AiReviewEndingSummary {
  nodeId: string;
  title: string;
  summary: string;
}

export interface AiReviewInput {
  provider: GenerationProvider;
  chapters: AiReviewChapter[];
  canon: string[];
  characterCards: string[];
  endingSummaries: AiReviewEndingSummary[];
  model?: string;
}

export interface AiReviewResult {
  passed: boolean;
  issues: ValidationIssueInput[];
  providerResults: ProviderResult<AiReviewOutput>[];
}

export async function runAiContinuityReview(input: AiReviewInput): Promise<AiReviewResult> {
  const providerResults: ProviderResult<AiReviewOutput>[] = [];
  const issues: ValidationIssueInput[] = [];

  for (const chapter of input.chapters) {
    const providerResult = await input.provider.generate({
      stage: "continuity_review",
      stepKey: `ai_review:chapter:${chapter.chapterId}`,
      systemPrompt: STAGE_SYSTEM_PROMPT,
      userPrompt: buildChapterPrompt(input, chapter),
      outputSchema: AiReviewOutputSchema,
      model: input.model,
    });
    providerResults.push(providerResult);
    issues.push(...toValidationIssues(providerResult.data, `chapter:${chapter.chapterId}`));
  }

  const globalResult = await input.provider.generate({
    stage: "continuity_review",
    stepKey: "ai_review:global",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: buildGlobalPrompt(input),
    outputSchema: AiReviewOutputSchema,
    model: input.model,
  });
  providerResults.push(globalResult);
  issues.push(...toValidationIssues(globalResult.data, "global"));

  return {
    passed: providerResults.every((result) => result.data.passed),
    issues,
    providerResults,
  };
}

function buildChapterPrompt(input: AiReviewInput, chapter: AiReviewChapter): string {
  return `Review this chapter for continuity only. Return exactly one JSON object with shape {"passed": boolean, "issues": [{"code": "CHARACTER_CONTRADICTION | TIMELINE_CONTRADICTION | SETTING_CONTRADICTION | ARC_UNRESOLVED | PACING | ENDING_QUALITY", "message": "string", "nodeIds": ["string"], "evidence": ["string"], "severity": "warning | blocking"}]}. Use an empty issues array when there are no findings. Never use a warnings or proseEdits field; never request edits or rewrite prose. Canon: ${JSON.stringify(input.canon)}. Character cards: ${JSON.stringify(input.characterCards)}. Ending summaries: ${JSON.stringify(input.endingSummaries)}. Chapter: ${JSON.stringify(chapter)}`;
}

function buildGlobalPrompt(input: AiReviewInput): string {
  const chapterSummaries = input.chapters.map((chapter) => ({
    chapterId: chapter.chapterId,
    title: chapter.title,
    summary: chapter.summary,
    nodes: chapter.nodes.map((node) => ({ nodeId: node.nodeId, title: node.title, summary: node.summary })),
  }));
  return `Review the complete story for continuity, unresolved arcs, pacing, and ending quality. Return exactly one JSON object with shape {"passed": boolean, "issues": [{"code": "CHARACTER_CONTRADICTION | TIMELINE_CONTRADICTION | SETTING_CONTRADICTION | ARC_UNRESOLVED | PACING | ENDING_QUALITY", "message": "string", "nodeIds": ["string"], "evidence": ["string"], "severity": "warning | blocking"}]}. Use an empty issues array when there are no findings. Never use a warnings or proseEdits field; never request edits or rewrite prose. Canon: ${JSON.stringify(input.canon)}. Character cards: ${JSON.stringify(input.characterCards)}. Ending summaries: ${JSON.stringify(input.endingSummaries)}. Chapters: ${JSON.stringify(chapterSummaries)}`;
}

function toValidationIssues(output: AiReviewOutput, scope: string): ValidationIssueInput[] {
  return output.issues.map((issue) => ({
    source: "ai_review",
    severity: "warning",
    code: issue.code,
    message: issue.message,
    nodeId: issue.nodeIds[0] ?? null,
    edgeId: null,
    detailsJson: {
      scope,
      nodeIds: issue.nodeIds,
      evidence: issue.evidence,
      providerSeverity: issue.severity ?? "warning",
    },
  }));
}
