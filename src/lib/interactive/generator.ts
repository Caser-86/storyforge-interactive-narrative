import { z } from "zod";
import { AuthoringError } from "@/lib/authoring/errors";
import type { Project } from "@/lib/authoring/schemas";
import { OpenAICompatibleGenerationProvider } from "@/lib/authoring/generation/openai-provider";
import type { GenerationProvider, ProviderResult } from "@/lib/authoring/generation/provider";
import {
  InteractiveChoiceSchema,
  InteractiveContinuitySchema,
  InteractiveSceneSchema,
  type InteractiveChoice,
  type InteractiveScene,
  type InteractiveState,
} from "./schemas";
import { FakeInteractiveGenerationProvider } from "./fake-provider";
import {
  endingMemoryConstraint,
  mergeStoryMemory,
  StoryMemoryFactSchema,
  StoryMemoryPatchSchema,
  StoryMemoryThreadSchema,
  storyMemoryForPrompt,
} from "./story-memory";

// Leave bounded repair headroom for provider drift without weakening the persisted scene contract.
const INTERACTIVE_BODY_MAX_LENGTH = 1_800;
const INTERACTIVE_SUMMARY_MAX_LENGTH = 300;
const INTERACTIVE_PROVIDER_BODY_HEADROOM = 6_000;
const INTERACTIVE_PROVIDER_SUMMARY_HEADROOM = 1_000;
const INTERACTIVE_PROVIDER_MAX_CHOICES = 6;

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
    body: z.string().min(1).max(INTERACTIVE_BODY_MAX_LENGTH),
    summary: z.string().min(2).max(INTERACTIVE_SUMMARY_MAX_LENGTH),
    choices: z.array(InteractiveModelChoiceSchema).max(INTERACTIVE_PROVIDER_MAX_CHOICES).default([]),
    // Treat an omitted marker as an active scene so the turn-aware repair flow can decide whether it is actually the ending.
    isEnding: z.boolean().default(false),
    endingSummary: z.string().trim().max(INTERACTIVE_SUMMARY_MAX_LENGTH).nullable().default(null),
  })
  .strip();

const InteractiveProviderSceneSchema = InteractiveModelSceneSchema.extend({
  body: z.string().min(1).max(INTERACTIVE_PROVIDER_BODY_HEADROOM),
  summary: z.string().min(2).max(INTERACTIVE_PROVIDER_SUMMARY_HEADROOM),
  endingSummary: z.string().trim().max(INTERACTIVE_PROVIDER_SUMMARY_HEADROOM).nullable().default(null),
});

const InteractiveNormalizedSceneSchema = z
  .object({
    title: z.string().min(2).max(80),
    body: z.string().min(1).max(INTERACTIVE_BODY_MAX_LENGTH),
    summary: z.string().min(2).max(INTERACTIVE_SUMMARY_MAX_LENGTH),
    choices: z.array(InteractiveChoiceSchema).max(3),
    isEnding: z.boolean(),
    endingSummary: z.string().trim().max(INTERACTIVE_SUMMARY_MAX_LENGTH).nullable(),
  })
  .strict();

const InteractiveNormalizedSceneWithRepairHeadroomSchema = InteractiveNormalizedSceneSchema.extend({
  body: z.string().min(1).max(INTERACTIVE_PROVIDER_BODY_HEADROOM),
  summary: z.string().min(2).max(INTERACTIVE_PROVIDER_SUMMARY_HEADROOM),
  choices: z.array(InteractiveChoiceSchema).max(INTERACTIVE_PROVIDER_MAX_CHOICES),
  endingSummary: z.string().trim().max(INTERACTIVE_PROVIDER_SUMMARY_HEADROOM).nullable(),
});

export const InteractiveStatePatchSchema = z
  .object({
    knownFacts: z.array(z.string().trim().min(1)).max(20).optional(),
    openThreads: z.array(z.string().trim().min(1)).max(20).optional(),
    resolvedThreads: z.array(z.string().trim().min(1)).max(20).optional(),
    lastChoiceImpact: z.string().max(240).optional(),
    endingReadiness: z.number().min(0).max(100).optional(),
    continuity: InteractiveContinuitySchema.optional(),
    memoryPatch: StoryMemoryPatchSchema.optional(),
  })
  .strict();

function normalizeContentOnlyStateMemory(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  const statePatch = envelope.statePatch;
  if (typeof statePatch !== "object" || statePatch === null || Array.isArray(statePatch)) return value;

  const normalizedStatePatch = { ...(statePatch as Record<string, unknown>) };
  const normalizeEntries = (entries: unknown): unknown => {
    if (!Array.isArray(entries)) return entries;
    return entries.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return entry;
      const record = entry as Record<string, unknown>;
      return Object.keys(record).length === 1 && typeof record.content === "string" ? record.content : entry;
    });
  };
  for (const key of ["knownFacts", "openThreads", "resolvedThreads"] as const) {
    normalizedStatePatch[key] = normalizeEntries(normalizedStatePatch[key]);
  }

  const memoryPatch = normalizedStatePatch.memoryPatch;
  if (typeof memoryPatch === "object" && memoryPatch !== null && !Array.isArray(memoryPatch)) {
    // Keep a usable scene when a model omits fields from one auxiliary memory entry.
    const normalizedMemoryPatch = { ...(memoryPatch as Record<string, unknown>) };
    if (!("mainlineFacts" in normalizedMemoryPatch) && Array.isArray(normalizedMemoryPatch.facts)) {
      normalizedMemoryPatch.mainlineFacts = normalizedMemoryPatch.facts;
    }
    if (!("plotThreads" in normalizedMemoryPatch) && Array.isArray(normalizedMemoryPatch.threads)) {
      normalizedMemoryPatch.plotThreads = normalizedMemoryPatch.threads;
    }
    if (!("resolvedThreadIds" in normalizedMemoryPatch) && Array.isArray(normalizedMemoryPatch.resolvedIds)) {
      normalizedMemoryPatch.resolvedThreadIds = normalizedMemoryPatch.resolvedIds;
    }
    if (!("resolvedThreadIds" in normalizedMemoryPatch) && Array.isArray(normalizedMemoryPatch.resolved)) {
      normalizedMemoryPatch.resolvedThreadIds = normalizedMemoryPatch.resolved;
    }
    if (!("resolvedThreadIds" in normalizedMemoryPatch) && Array.isArray(normalizedMemoryPatch.resolvedThreads)) {
      normalizedMemoryPatch.resolvedThreadIds = normalizedMemoryPatch.resolvedThreads;
    }
    delete normalizedMemoryPatch.facts;
    delete normalizedMemoryPatch.threads;
    delete normalizedMemoryPatch.resolvedIds;
    delete normalizedMemoryPatch.resolved;
    delete normalizedMemoryPatch.resolvedThreads;
    if (Array.isArray(normalizedMemoryPatch.mainlineFacts)) {
      normalizedMemoryPatch.mainlineFacts = normalizedMemoryPatch.mainlineFacts.filter((entry) => StoryMemoryFactSchema.safeParse(entry).success);
    }
    if (Array.isArray(normalizedMemoryPatch.plotThreads)) {
      normalizedMemoryPatch.plotThreads = normalizedMemoryPatch.plotThreads.filter((entry) => StoryMemoryThreadSchema.safeParse(entry).success);
    }
    const normalizedResolvedIds = normalizeEntries(normalizedMemoryPatch.resolvedThreadIds);
    if (Array.isArray(normalizedResolvedIds)) {
      normalizedMemoryPatch.resolvedThreadIds = normalizedResolvedIds.flatMap((entry) => {
        if (typeof entry === "string") return entry.trim() ? [entry.trim()] : [];
        if (typeof entry === "object" && entry !== null && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).id === "string") {
          const id = ((entry as Record<string, unknown>).id as string).trim();
          return id ? [id] : [];
        }
        return [];
      });
    } else {
      normalizedMemoryPatch.resolvedThreadIds = normalizedResolvedIds;
    }
    normalizedStatePatch.memoryPatch = {
      ...normalizedMemoryPatch,
    };
  }

  return { ...envelope, statePatch: normalizedStatePatch };
}

function normalizeGenerationEnvelope(value: unknown): unknown {
  const normalized = normalizeContentOnlyStateMemory(value);
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) return normalized;
  const envelope = normalized as Record<string, unknown>;
  const statePatch = typeof envelope.statePatch === "object" && envelope.statePatch !== null && !Array.isArray(envelope.statePatch)
    ? { ...(envelope.statePatch as Record<string, unknown>) }
    : {};

  // Some compatible providers place this known legacy field beside scene/statePatch.
  if (!("endingReadiness" in statePatch) && "endingReadiness" in envelope) {
    statePatch.endingReadiness = envelope.endingReadiness;
  }
  delete envelope.endingReadiness;
  return { ...envelope, statePatch };
}

const InteractiveGenerationOutputBaseSchema = z.object({
  scene: InteractiveModelSceneSchema,
  statePatch: InteractiveStatePatchSchema.default({}),
}).strict();

const InteractiveGenerationProviderOutputBaseSchema = z.object({
  scene: InteractiveProviderSceneSchema,
  statePatch: InteractiveStatePatchSchema.default({}),
}).strict();

const InteractiveGenerationContractSchema = InteractiveGenerationOutputBaseSchema.superRefine((output, context) => {
  const scene = output.scene;
  if (!scene.isEnding && scene.choices.length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scene", "choices"], message: "An active scene must offer at least two choices." });
  }
  if (!scene.isEnding && scene.choices.length !== 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scene", "choices"], message: "An active scene must offer exactly three choices." });
  }
  if (!scene.isEnding && new Set(scene.choices.map((choice) => choice.risk)).size !== 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scene", "choices"], message: "An active scene must include one choice for each risk level." });
  }
  if (scene.isEnding && scene.choices.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scene", "choices"], message: "An ending scene cannot offer choices." });
  }
  if (scene.isEnding && !scene.endingSummary) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scene", "endingSummary"], message: "An ending scene must include a summary." });
  }
});

export const InteractiveGenerationOutputSchema = z
  .preprocess(normalizeGenerationEnvelope, InteractiveGenerationContractSchema) as unknown as typeof InteractiveGenerationContractSchema;

const InteractiveGenerationProviderOutputSchema = z
  .preprocess(normalizeGenerationEnvelope, InteractiveGenerationProviderOutputBaseSchema) as unknown as typeof InteractiveGenerationProviderOutputBaseSchema;

type InteractiveGenerationOutput = z.infer<typeof InteractiveGenerationOutputBaseSchema>;

export interface InteractiveGenerationInput {
  project: Project;
  state: InteractiveState;
  previousScene?: InteractiveScene | null;
  selectedChoice?: InteractiveChoice | null;
  signal?: AbortSignal;
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

function dedupe(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-limit);
}

function hasConcreteChoiceImpact(value: string | undefined): value is string {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  return ![
    /^(?:选择[“"'].+[”"']后，?)?(?:局势|情况|调查方向|事情|状态)(?:发生了?|出现了?)变化[。.!！?？]*$/u,
    /^(?:after choosing .+, )?(?:the )?(?:situation|state|direction) (?:has )?changed[.!?]*$/i,
  ].some((pattern) => pattern.test(normalized));
}

function applyStatePatch(state: InteractiveState, patch: z.infer<typeof InteractiveStatePatchSchema>, selectedChoice: InteractiveChoice | null | undefined, sceneSummary: string): InteractiveState {
  const memoryPatch = patch.memoryPatch ?? {};
  const generatedChoiceImpact = patch.lastChoiceImpact?.trim();
  const choiceImpact = selectedChoice
    ? hasConcreteChoiceImpact(generatedChoiceImpact)
      ? generatedChoiceImpact
      : hasConcreteChoiceImpact(sceneSummary)
        ? sceneSummary.trim()
        : selectedChoice.consequencePreview
    : generatedChoiceImpact ?? state.lastChoiceImpact;
  return {
    ...state,
    turn: state.turn + (selectedChoice ? 1 : 0),
    knownFacts: dedupe([...state.knownFacts, ...(patch.knownFacts ?? [])], 20),
    openThreads: dedupe([...state.openThreads, ...(patch.openThreads ?? [])].filter((thread) => !(patch.resolvedThreads ?? []).includes(thread)), 10),
    resolvedThreads: dedupe([...state.resolvedThreads, ...(patch.resolvedThreads ?? [])], 20),
    lastChoiceImpact: choiceImpact,
    endingReadiness: patch.endingReadiness ?? Math.min(100, state.endingReadiness + (selectedChoice ? 8 : 0)),
    continuity: patch.continuity ?? state.continuity,
    memory: mergeStoryMemory(state.memory, {
      mainlineFacts: memoryPatch.mainlineFacts ?? [],
      plotThreads: memoryPatch.plotThreads ?? [],
      resolvedThreadIds: memoryPatch.resolvedThreadIds ?? [],
      legacyFacts: patch.knownFacts ?? [],
      legacyThreads: patch.openThreads ?? [],
      legacyResolvedThreads: patch.resolvedThreads ?? [],
      recentSummary: sceneSummary,
    }),
  };
}

function normalizeScene(scene: InteractiveGenerationOutput["scene"]): InteractiveScene {
  const choices = scene.choices.map((choice, index) => ({
    id: `choice_${String.fromCharCode(97 + index)}`,
    label: choice.label,
    intent: choice.intent,
    risk: choice.risk,
    consequencePreview: choice.consequencePreview,
  }));

  return InteractiveNormalizedSceneWithRepairHeadroomSchema.parse({
    title: scene.title,
    body: scene.body,
    summary: scene.summary,
    choices: scene.isEnding ? [] : choices,
    isEnding: scene.isEnding,
    endingSummary: scene.endingSummary?.trim() || null,
  });
}

function hasValidEndingContract(scene: InteractiveScene): boolean {
  return InteractiveSceneSchema.safeParse(scene).success;
}

function hasUnresolvedEndingPromise(scene: InteractiveScene): boolean {
  const endingText = [scene.summary, scene.endingSummary ?? ""].join("\n");
  return [
    /(?:将|会|仍将|还会).{0,12}(?:继续|揭示|解决|完成|说明|展开)/u,
    /(?:故事|真相|冲突).{0,12}(?:还没|尚未|未被|仍未).{0,8}(?:结束|解决|收束|揭示)/u,
    /(?:to be continued|will continue|remains? to be revealed|not yet resolved)/i,
  ].some((pattern) => pattern.test(endingText));
}

function hasEndingQualityContract(scene: InteractiveScene): boolean {
  return hasValidEndingContract(scene) && !hasUnresolvedEndingPromise(scene);
}

function validateActiveChoiceContract(scene: InteractiveScene): void {
  const riskLevels = new Set(scene.choices.map((choice) => choice.risk));
  if (scene.choices.length !== 3 || riskLevels.size !== 3) {
    throw new AuthoringError("VALIDATION", "Interactive model did not provide one choice for each risk level.", {
      choiceCount: scene.choices.length,
      riskLevels: [...riskLevels],
    });
  }
}

function validateActiveSceneContract(scene: InteractiveScene): void {
  const validated = InteractiveSceneSchema.safeParse(scene);
  if (!validated.success) {
    throw new AuthoringError("VALIDATION", "Interactive model did not provide a valid active scene or choice set.", {
      issues: validated.error.issues,
    });
  }
  validateActiveChoiceContract(validated.data);
}

function buildPrompt(input: InteractiveGenerationInput, language: string): string {
  const nextTurn = input.state.turn + (input.selectedChoice ? 1 : 0);
  const outputExample = nextTurn >= input.state.targetTurns
    ? '{ "scene": { "title": "string", "body": "string", "summary": "string", "choices": [], "isEnding": true, "endingSummary": "string" }, "statePatch": { "continuity": { "location": "string", "time": "string", "activeCharacters": ["string"], "sceneGoal": "string" } } }'
    : '{ "scene": { "title": "string", "body": "string", "summary": "string", "choices": [{ "id": "choice_a", "label": "string", "intent": "string", "risk": "low | medium | high", "consequencePreview": "string" }], "isEnding": false, "endingSummary": null }, "statePatch": { "knownFacts": ["string"], "openThreads": ["string"], "resolvedThreads": ["string"], "lastChoiceImpact": "string", "endingReadiness": 0, "continuity": { "location": "string", "time": "string", "activeCharacters": ["string"], "sceneGoal": "string" }, "memoryPatch": { "mainlineFacts": [{ "id": "fact-stable-id", "content": "string", "immutable": true }], "plotThreads": [{ "id": "thread-stable-id", "summary": "string", "priority": "high | medium | low", "status": "open | resolved" }], "resolvedThreadIds": ["thread-stable-id"] } }';
  return [
    `Project: ${JSON.stringify({ title: input.project.title, premise: input.project.premise, genre: input.project.genre, tone: input.project.tone, pointOfView: input.project.pointOfView, rating: input.project.rating, language })}`,
    `Story progress: turn ${nextTurn}/${input.state.targetTurns}. Generate only the current scene, never the whole story.`,
    `State memory: ${JSON.stringify(input.state)}`,
    `Structured story memory: ${storyMemoryForPrompt(input.state.memory)}`,
    `Continuity anchor: ${JSON.stringify(input.state.continuity ?? null)}`,
    `Previous scene: ${JSON.stringify(input.previousScene ?? null)}`,
    `Player choice: ${JSON.stringify(input.selectedChoice ?? null)}`,
    input.selectedChoice
      ? `Author selected direction: ${input.selectedChoice.label}. Honor this direction and show its direct consequence before presenting new choices.`
      : "Author has not selected a direction yet; establish the opening situation before presenting choices.",
    `If a player choice is present, the new scene must show its direct consequence and move the story forward. Make the next choices materially different, with different risks and consequences.`,
    "Maintain a coherent timeline: preserve the established time and sequence of events, and explain any substantial time jump in the scene body; never introduce an unexplained timestamp or chronological contradiction. Use an unambiguous 24-hour clock for same-day times after noon (for example, 15:41 rather than 09:41), and label flashbacks or another day explicitly.",
    "Maintain the continuity anchor: return statePatch.continuity with the current location, time, active characters, and immediate scene goal. Keep established names and places exactly consistent; if the location, time, or active cast changes, connect that change in the scene body instead of cutting without explanation.",
    "Direct consequence must be concrete: name the immediate change caused by the author's selected choice in the scene body and summary; do not use a generic phrase such as \"the situation changed\" without stating what changed.",
    nextTurn >= input.state.targetTurns
      ? `This is the final planned turn. Resolve the main conflict now, set isEnding to true, and return an empty choices array. Do not end with an unresolved future promise such as "will continue" or "will be revealed later"; state the concrete outcome and cost in the body and endingSummary. ${endingMemoryConstraint(input.state.memory)}`
      : "Set isEnding to false and return exactly three meaningful choices: one low, one medium, and one high risk choice. Do not end early; the final planned turn is the only turn that may end the story.",
    "Keep statePatch concise: knownFacts, openThreads, and resolvedThreads contain only newly changed plain strings (at most 6, 6, and 4 items); memoryPatch contains only new or changed entries (at most 6 facts, 6 threads, and 6 resolved IDs). Never repeat the full memory.",
    `Return exactly this JSON shape: ${outputExample}`,
    "JSON validity is mandatory: quote every key and string, escape embedded quotation marks and newlines, do not use trailing commas, code fences, analysis, extra keys, or image prompts.",
    `Hard length limits: scene.body must contain between 1 and ${INTERACTIVE_BODY_MAX_LENGTH} characters; scene.summary must contain between 2 and ${INTERACTIVE_SUMMARY_MAX_LENGTH} characters; scene.endingSummary must contain between 1 and ${INTERACTIVE_SUMMARY_MAX_LENGTH} characters when isEnding is true.`,
    "All natural-language values must be written in the project language.",
  ].join("\n\n");
}

export async function generateInteractiveScene(input: InteractiveGenerationInput, provider = createInteractiveGenerationProvider()): Promise<InteractiveGenerationResult> {
  const language = languageFor(input.project);
  const request = {
    stage: "nodes",
    stepKey: input.selectedChoice ? `interactive:turn:${input.state.turn + 1}` : "interactive:opening",
    systemPrompt: `You are StoryForge's interactive narrative engine. Generate one scene at a time after the player's choice. Return only valid JSON matching the requested schema. Every natural-language value must use the project language (${language}). Preserve established facts and resolve the story within the target turn limit.`,
    userPrompt: buildPrompt(input, language),
    outputSchema: InteractiveGenerationProviderOutputSchema,
    model: process.env.OPENAI_MODEL,
    temperature: 0.2,
    maxTokens: 3200,
    signal: input.signal,
  } as const;

  const nextTurn = input.state.turn + (input.selectedChoice ? 1 : 0);
  let providerResult = await provider.generate(request);
  let normalizedScene = normalizeScene(providerResult.data.scene);
  if (nextTurn >= input.state.targetTurns && (!normalizedScene.isEnding || !hasEndingQualityContract(normalizedScene))) {
    providerResult = await provider.generate({
      ...request,
      stepKey: `interactive:ending-repair:${nextTurn}`,
      systemPrompt: `${request.systemPrompt} This is a repair pass. You must produce the model-written final ending now.`,
      userPrompt: [
        request.userPrompt,
        "The previous response did not provide a valid ending for the final planned turn.",
        "Rewrite the current scene as the actual ending: resolve the main conflict now, show the consequence of the author's selected direction, provide a non-empty endingSummary, set isEnding to true, and return no choices. Do not leave the central conflict or a high-priority thread for a later scene, sequel, or future revelation; state the concrete outcome and cost now.",
        `Hard length limits: scene.body must contain between 1 and ${INTERACTIVE_BODY_MAX_LENGTH} characters; scene.summary must contain between 2 and ${INTERACTIVE_SUMMARY_MAX_LENGTH} characters; scene.endingSummary must contain between 1 and ${INTERACTIVE_SUMMARY_MAX_LENGTH} characters.`,
        endingMemoryConstraint(input.state.memory),
      ].join("\n\n"),
    });
    normalizedScene = normalizeScene(providerResult.data.scene);
  }
  if (nextTurn < input.state.targetTurns && normalizedScene.isEnding) {
    providerResult = await provider.generate({
      ...request,
      stepKey: `interactive:active-repair:${nextTurn}`,
      systemPrompt: `${request.systemPrompt} This is a repair pass. The story is not allowed to end before the final planned turn.`,
      userPrompt: [
        request.userPrompt,
        "The previous response ended before the final planned turn.",
        "Rewrite the current scene as an active scene: continue the author's selected direction, set isEnding to false, and return exactly three meaningful choices with one low, one medium, and one high risk choice. Do not provide an ending summary.",
        `Hard length limits: scene.body must contain between 1 and ${INTERACTIVE_BODY_MAX_LENGTH} characters; scene.summary must contain between 2 and ${INTERACTIVE_SUMMARY_MAX_LENGTH} characters.`,
      ].join("\n\n"),
    });
    normalizedScene = normalizeScene(providerResult.data.scene);
  }
  if (nextTurn < input.state.targetTurns && !normalizedScene.isEnding) {
    try {
      validateActiveSceneContract(normalizedScene);
    } catch (error) {
      if (!(error instanceof AuthoringError) || error.code !== "VALIDATION") throw error;
      providerResult = await provider.generate({
        ...request,
        stepKey: `interactive:choice-repair:${nextTurn}`,
        systemPrompt: `${request.systemPrompt} This is a repair pass. The active scene must include exactly one choice at each risk level.`,
        userPrompt: [
          request.userPrompt,
          "The previous response did not provide one choice for each risk level.",
          "Rewrite the current scene as an active scene with exactly three choices: one low risk, one medium risk, and one high risk. Make their intents and direct consequences materially different, set isEnding to false, and set endingSummary to null.",
          `Hard length limits: scene.body must contain between 1 and ${INTERACTIVE_BODY_MAX_LENGTH} characters; scene.summary must contain between 2 and ${INTERACTIVE_SUMMARY_MAX_LENGTH} characters.`,
        ].join("\n\n"),
      });
      normalizedScene = normalizeScene(providerResult.data.scene);
    }
  }
  if (nextTurn < input.state.targetTurns && normalizedScene.isEnding) {
    throw new AuthoringError("VALIDATION", "Interactive model ended before the planned turn limit.", { nextTurn, targetTurns: input.state.targetTurns });
  }
  if (nextTurn < input.state.targetTurns) validateActiveSceneContract(normalizedScene);
  if (nextTurn >= input.state.targetTurns) {
    if (!normalizedScene.isEnding || !hasEndingQualityContract(normalizedScene)) {
      throw new AuthoringError("VALIDATION", "Interactive model did not produce a valid ending after the repair attempt.", { nextTurn, targetTurns: input.state.targetTurns });
    }
    const validatedEnding = InteractiveSceneSchema.safeParse(normalizedScene);
    if (!validatedEnding.success) {
      throw new AuthoringError("VALIDATION", "Interactive model did not produce a valid ending after the repair attempt.", {
        nextTurn,
        targetTurns: input.state.targetTurns,
        issues: validatedEnding.error.issues,
      });
    }
    normalizedScene = validatedEnding.data;
  }
  const state = applyStatePatch(input.state, providerResult.data.statePatch, input.selectedChoice, normalizedScene.summary);
  return { scene: normalizedScene, state, providerResult };
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
    memory: { mainlineFacts: [], plotThreads: [], recentSummaries: [] },
  };
}
