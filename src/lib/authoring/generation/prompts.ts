import type { ProjectSize } from "../schemas";
import type { BibleOutput, BriefOutput, GraphOutput, OutlineOutput } from "./stages/types";

export interface GenerationProjectContext {
  projectId: string;
  versionId: string;
  title: string;
  premise: string;
  genre: string;
  tone: string;
  pointOfView: string;
  rating: string;
  language: string;
  size: ProjectSize;
  model?: string;
}

export const STAGE_SYSTEM_PROMPT = "You are a structured interactive-fiction planner. Return only valid JSON matching the requested schema. Write every natural-language value in the language specified by the project context. Do not reveal analysis or markdown. Keep strings concise, identifiers stable, and never invent prose for a later stage.";

export const STAGE_MAX_TOKENS = {
  brief: 1600,
  bible: 2600,
  outline: 9000,
  graph: 7000,
  nodes: 2200,
  continuity_review: 7000,
  author_ending: 3600,
} as const;

export function minimumBranchingNodes(context: GenerationProjectContext): number {
  return Math.min(4, Math.max(2, Math.floor((context.size.targetNodes - context.size.targetEndings) / 4)));
}

function projectFrame(context: GenerationProjectContext): string {
  return JSON.stringify({
    title: context.title,
    premise: context.premise,
    genre: context.genre,
    tone: context.tone,
    pointOfView: context.pointOfView,
    rating: context.rating,
    language: context.language,
    size: context.size,
  });
}

export function buildBriefPrompt(context: GenerationProjectContext): string {
  return `Create the story brief for this project. Project: ${projectFrame(context)}. Define the reader promise without writing scene prose. Return exactly this JSON shape: { "title": "string", "premise": "string", "promise": "string", "genre": "string", "tone": "string", "audience": "string" }. Do not include extra keys, project metadata, markdown, or scene prose.`;
}

export function buildBiblePrompt(context: GenerationProjectContext, brief: BriefOutput): string {
  return `Create the story bible. Project: ${projectFrame(context)}. Brief: ${JSON.stringify(brief)}. Define immutable world rules, themes, characters, canon facts, and forbidden changes. Return exactly this JSON shape: { "worldRules": ["string"], "themes": ["string"], "characters": [{ "id": "string", "name": "string", "role": "string", "traits": ["string"], "goal": "string", "secret": "string" }], "canonFacts": ["string"], "forbiddenChanges": ["string"] }. Use at least one item in every required array. Do not include extra keys, markdown, or scene prose.`;
}

export function buildOutlinePrompt(context: GenerationProjectContext, brief: BriefOutput, bible: BibleOutput): string {
  return `Create a bounded chapter and node outline. Project: ${projectFrame(context)}. Brief: ${JSON.stringify(brief)}. Bible: ${JSON.stringify(bible)}. The outline must contain exactly ${context.size.targetNodes} total nodes, never more or fewer. Allocate stable chapter and node IDs, exactly one start node, and exactly ${context.size.targetEndings} ending node plans; use the remaining node budget for scene nodes. Return exactly this JSON shape: { "chapters": [{ "id": "string", "title": "string", "goal": "string", "summary": "string" }], "nodes": [{ "id": "string", "chapterId": "string", "kind": "start | scene | ending", "title": "string", "objective": "string" }] }. Use kind exactly as one of start, scene, or ending. Do not include extra keys, final node bodies, markdown, or scene prose.`;
}

export function buildGraphPrompt(
  context: GenerationProjectContext,
  brief: BriefOutput,
  bible: BibleOutput,
  outline: OutlineOutput,
): string {
  const requiredBranchingNodes = minimumBranchingNodes(context);
  return `Create the directed story graph skeleton. Project: ${projectFrame(context)}. Brief: ${JSON.stringify(brief)}. Bible: ${JSON.stringify(bible)}. Outline: ${JSON.stringify(outline)}. Reuse every outline chapter and node ID exactly, add only valid edge references, and stay within ${context.size.targetNodes} nodes. Return exactly this JSON shape: { "chapters": [{ "id": "string", "title": "string", "goal": "string", "summary": "string" }], "nodes": [{ "id": "string", "chapterId": "string", "kind": "start | scene | ending", "title": "string", "objective": "string", "summary": "string", "topologicalRank": 0 }], "edges": [{ "id": "string", "sourceNodeId": "string", "targetNodeId": "string", "label": "string", "intent": "string", "consequenceSummary": "string", "branchType": "main | side", "sortOrder": 0 }] }. Keep the graph acyclic. The single start node must immediately offer at least two outgoing choices. Also create at least ${requiredBranchingNodes} distinct branching decision nodes, each with at least two outgoing choices. Do not make the whole story a single chain with only one split near the ending. At every branching node, exactly one edge must have branchType main and every other edge must have branchType side; every side branch must merge back into the mainline or reach an ending. Do not include extra keys, final node bodies, markdown, or scene prose.`;
}

export function buildStageRequestContext(context: GenerationProjectContext): { model?: string } {
  return { model: context.model };
}

export type StageOutput = BriefOutput | BibleOutput | OutlineOutput | GraphOutput;
