import { z } from "zod";
import { AuthoringError } from "@/lib/authoring/errors";
import type { Project } from "@/lib/authoring/schemas";
import { OpenAICompatibleGenerationProvider } from "@/lib/authoring/generation/openai-provider";
import type { GenerationProvider, ProviderResult } from "@/lib/authoring/generation/provider";
import {
  InteractiveSceneSchema,
  type InteractiveChoice,
  type InteractiveScene,
  type InteractiveState,
} from "./schemas";
import { FakeInteractiveGenerationProvider } from "./fake-provider";

const InteractiveModelChoiceSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(2).max(100),
    intent: z.string().min(4).max(180),
    risk: z.enum(["low", "medium", "high"]),
    consequencePreview: z.string().min(4).max(180),
  })
  .strip();

const InteractiveModelSceneSchema = z
  .object({
    title: z.string().min(2).max(80),
    body: z.string().min(1).max(1800),
    summary: z.string().min(2).max(300),
    choices: z.array(InteractiveModelChoiceSchema).max(3),
    isEnding: z.boolean(),
    endingSummary: z.string().max(300).nullable(),
  })
  .strip()
  .superRefine((scene, context) => {
    if (!scene.isEnding && scene.choices.length < 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "An active scene must offer at least two choices." });
    }
    if (scene.isEnding && scene.choices.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "An ending scene cannot offer choices." });
    }
  });

export const InteractiveStatePatchSchema = z
  .object({
    knownFacts: z.array(z.string().min(1)).max(20).optional(),
    openThreads: z.array(z.string().min(1)).max(20).optional(),
    resolvedThreads: z.array(z.string().min(1)).max(20).optional(),
    lastChoiceImpact: z.string().max(240).optional(),
    endingReadiness: z.number().min(0).max(100).optional(),
  })
  .strict();

export const InteractiveGenerationOutputSchema = z
  .object({
    scene: InteractiveModelSceneSchema,
    statePatch: InteractiveStatePatchSchema,
  })
  .strict();

type InteractiveGenerationOutput = z.infer<typeof InteractiveGenerationOutputSchema>;

export interface InteractiveGenerationInput {
  project: Project;
  state: InteractiveState;
  previousScene?: InteractiveScene | null;
  selectedChoice?: InteractiveChoice | null;
}

export interface InteractiveGenerationResult {
  scene: InteractiveScene;
  state: InteractiveState;
  providerResult: ProviderResult<InteractiveGenerationOutput>;
}

export function createInteractiveGenerationProvider(): GenerationProvider {
  return process.env.GENERATION_PROVIDER === "fake"
    ? new FakeInteractiveGenerationProvider()
    : new OpenAICompatibleGenerationProvider();
}

function languageFor(project: Project): string {
  const settings = project.settingsJson;
  if (typeof settings === "object" && settings !== null && !Array.isArray(settings) && typeof settings.language === "string") {
    return settings.language;
  }
  return "Chinese";
}

function isChineseLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized.includes("中文") || normalized === "chinese" || normalized.startsWith("zh-") || normalized === "zh";
}

function dedupe(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-limit);
}

function applyStatePatch(state: InteractiveState, patch: z.infer<typeof InteractiveStatePatchSchema>, selectedChoice: InteractiveChoice | null | undefined): InteractiveState {
  return {
    ...state,
    turn: state.turn + (selectedChoice ? 1 : 0),
    knownFacts: dedupe([...state.knownFacts, ...(patch.knownFacts ?? [])], 20),
    openThreads: dedupe([...state.openThreads, ...(patch.openThreads ?? [])].filter((thread) => !(patch.resolvedThreads ?? []).includes(thread)), 10),
    resolvedThreads: dedupe([...state.resolvedThreads, ...(patch.resolvedThreads ?? [])], 20),
    lastChoiceImpact: patch.lastChoiceImpact ?? (selectedChoice ? `选择“${selectedChoice.label}”后，局势发生变化。` : state.lastChoiceImpact),
    endingReadiness: patch.endingReadiness ?? Math.min(100, state.endingReadiness + (selectedChoice ? 8 : 0)),
  };
}

function forceEnding(scene: InteractiveScene, language: string): InteractiveScene {
  if (scene.isEnding) return scene;
  return InteractiveSceneSchema.parse({
    ...scene,
    choices: [],
    isEnding: true,
    endingSummary: scene.endingSummary ?? (isChineseLanguage(language) ? "故事达到预设回合，进入结局。" : "The story reaches its planned length and comes to an ending."),
  });
}

function normalizeScene(scene: InteractiveGenerationOutput["scene"]): InteractiveScene {
  const choices = scene.choices.map((choice, index) => ({
    id: `choice_${String.fromCharCode(97 + index)}`,
    label: choice.label,
    intent: choice.intent,
    risk: choice.risk,
    consequencePreview: choice.consequencePreview,
  }));

  return InteractiveSceneSchema.parse({
    title: scene.title,
    body: scene.body,
    summary: scene.summary,
    choices: scene.isEnding ? [] : choices,
    isEnding: scene.isEnding,
    endingSummary: scene.endingSummary ?? null,
  });
}

function buildPrompt(input: InteractiveGenerationInput, language: string): string {
  const nextTurn = input.state.turn + (input.selectedChoice ? 1 : 0);
  return [
    `Project: ${JSON.stringify({ title: input.project.title, premise: input.project.premise, genre: input.project.genre, tone: input.project.tone, pointOfView: input.project.pointOfView, rating: input.project.rating, language })}`,
    `Story progress: turn ${nextTurn}/${input.state.targetTurns}. Generate only the current scene, never the whole story.`,
    `State memory: ${JSON.stringify(input.state)}`,
    `Previous scene: ${JSON.stringify(input.previousScene ?? null)}`,
    `Player choice: ${JSON.stringify(input.selectedChoice ?? null)}`,
    `If a player choice is present, the new scene must show its direct consequence and move the story forward. Make the next choices materially different, with different risks and consequences.`,
    nextTurn >= input.state.targetTurns
      ? "This is the final planned turn. Resolve the main conflict, set isEnding to true, and return an empty choices array."
      : "Set isEnding to false and return exactly three meaningful choices. Do not end early unless the story has naturally reached a decisive ending.",
    `Return exactly this JSON shape: { "scene": { "title": "string", "body": "string", "summary": "string", "choices": [{ "id": "choice_a", "label": "string", "intent": "string", "risk": "low | medium | high", "consequencePreview": "string" }], "isEnding": false, "endingSummary": null }, "statePatch": { "knownFacts": ["string"], "openThreads": ["string"], "resolvedThreads": ["string"], "lastChoiceImpact": "string", "endingReadiness": 0 } }`,
    "All natural-language values must be written in the project language. Do not include markdown, analysis, extra keys, or image prompts.",
  ].join("\n\n");
}

export async function generateInteractiveScene(input: InteractiveGenerationInput, provider = createInteractiveGenerationProvider()): Promise<InteractiveGenerationResult> {
  const language = languageFor(input.project);
  const providerResult = await provider.generate({
    stage: "nodes",
    stepKey: input.selectedChoice ? `interactive:turn:${input.state.turn + 1}` : "interactive:opening",
    systemPrompt: `You are StoryForge's interactive narrative engine. Generate one scene at a time after the player's choice. Return only valid JSON matching the requested schema. Every natural-language value must use the project language (${language}). Preserve established facts and resolve the story within the target turn limit.`,
    userPrompt: buildPrompt(input, language),
    outputSchema: InteractiveGenerationOutputSchema,
    model: process.env.OPENAI_MODEL,
    temperature: 0.8,
    maxTokens: 3200,
  });

  const nextTurn = input.state.turn + (input.selectedChoice ? 1 : 0);
  const normalizedScene = normalizeScene(providerResult.data.scene);
  if (nextTurn < input.state.targetTurns && normalizedScene.isEnding) {
    throw new AuthoringError("VALIDATION", "Interactive model ended before the planned turn limit.", { nextTurn, targetTurns: input.state.targetTurns });
  }
  const scene = nextTurn >= input.state.targetTurns ? forceEnding(normalizedScene, language) : normalizedScene;
  const state = applyStatePatch(input.state, providerResult.data.statePatch, input.selectedChoice);
  return { scene, state, providerResult };
}

export function interactiveTargetTurns(project: Project): number {
  const requestedTurns = project.sizePreset === "micro"
    ? 6
    : project.sizePreset === "short"
      ? 8
      : project.sizePreset === "medium"
        ? 16
        : Math.max(8, Math.min(40, project.targetNodeCount));
  const endingNodesToReserve = Math.max(0, project.targetEndingCount - 1);
  const availablePathNodes = project.targetNodeCount - endingNodesToReserve;
  return Math.max(2, Math.min(requestedTurns, availablePathNodes));
}

export function createInteractiveState(project: Project, _sessionId: string): InteractiveState {
  const targetTurns = interactiveTargetTurns(project);
  return {
    seedPrompt: project.premise,
    turn: 1,
    targetTurns,
    knownFacts: [],
    openThreads: [],
    resolvedThreads: [],
    lastChoiceImpact: "",
    endingReadiness: 0,
  };
}
