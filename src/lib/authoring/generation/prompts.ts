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

export const STAGE_SYSTEM_PROMPT = "You are a structured interactive-fiction planner. Return only valid JSON matching the requested schema. Keep identifiers stable and never invent prose for a later stage.";

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
  return `Create the story bible. Project: ${projectFrame(context)}. Brief: ${JSON.stringify(brief)}. Define immutable world rules, themes, characters, canon facts, and forbidden changes.`;
}

export function buildOutlinePrompt(context: GenerationProjectContext, brief: BriefOutput, bible: BibleOutput): string {
  return `Create a bounded chapter and node outline. Project: ${projectFrame(context)}. Brief: ${JSON.stringify(brief)}. Bible: ${JSON.stringify(bible)}. Allocate stable chapter and node IDs, exactly one start node, and at least ${context.size.targetEndings} ending node plans. Do not write final node bodies.`;
}

export function buildGraphPrompt(
  context: GenerationProjectContext,
  brief: BriefOutput,
  bible: BibleOutput,
  outline: OutlineOutput,
): string {
  return `Create the directed story graph skeleton. Project: ${projectFrame(context)}. Brief: ${JSON.stringify(brief)}. Bible: ${JSON.stringify(bible)}. Outline: ${JSON.stringify(outline)}. Reuse every outline chapter and node ID exactly, add only valid edge references, and stay within ${context.size.targetNodes} nodes. Do not write final node bodies.`;
}

export function buildStageRequestContext(context: GenerationProjectContext): { model?: string } {
  return { model: context.model };
}

export type StageOutput = BriefOutput | BibleOutput | OutlineOutput | GraphOutput;
