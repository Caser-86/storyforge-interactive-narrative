import { z } from "zod";

export const NpcSchema = z.object({
  id: z.string().regex(/^npc_[a-z0-9_]+$/),
  name: z.string().min(1).max(24),
  role: z.string().max(40),
  attitude: z.string().max(40),
  dialogue: z.string().min(20).max(220),
  hiddenIntent: z.string().min(10).max(180),
});

export const ModelChoiceSchema = z.object({
  id: z.string().regex(/^choice_[a-c]$/),
  label: z.string().min(4).max(42),
  intent: z.string().min(10).max(120),
  risk: z.enum(["low", "medium", "high"]),
  preview: z.string().min(10).max(100),
  stateEffects: z.record(z.string(), z.number().min(-20).max(20)),
});

export const PersistedChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(4).max(42),
  intent: z.string().min(10).max(120),
  risk: z.enum(["low", "medium", "high"]),
  preview: z.string().min(10).max(100),
  stateEffects: z.record(z.string(), z.number().min(-20).max(20)),
  modelChoiceId: z.string().regex(/^choice_[a-c]$/).optional(),
});

export const ChoiceSchema = ModelChoiceSchema;

export const ArtPromptSchema = z.object({
  prompt: z.string().min(60).max(900),
  negativePrompt: z.string().max(400),
  aspectRatio: z.enum(["1:1", "4:3", "16:9", "9:16"]),
  styleLock: z.string().max(220),
  seedHint: z.number().min(1).max(2147483647),
});

export const BgmCueSchema = z.object({
  mood: z.string().max(60),
  bpm: z.number().min(40).max(180),
  instruments: z.array(z.string().max(32)).min(2).max(6),
  loopSeconds: z.union([z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
  sfx: z.array(z.string().max(40)).max(6),
  musicPrompt: z.string().min(20).max(240),
});

export const SceneSchema = z.object({
  title: z.string().min(2).max(40),
  location: z.string().min(2).max(80),
  timeOfDay: z.string().max(40),
  mood: z.array(z.string().max(24)).min(2).max(6),
  body: z.string().min(180).max(900),
  npcs: z.array(NpcSchema).min(1).max(4),
  choices: z.array(ChoiceSchema).min(3).max(3),
  artPrompt: ArtPromptSchema,
  bgmCue: BgmCueSchema,
  chapterGoal: z.string().min(20).max(180),
  memorySummary: z.string().min(20).max(240),
});

export const SafetySchema = z.object({
  rating: z.enum(["G", "PG", "PG-13", "R"]),
  contentWarnings: z.array(z.string().max(60)),
});

export const NarrativeOutputSchema = z.object({
  scene: SceneSchema,
  statePatch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.object({}), z.null()])),
  safety: SafetySchema,
});

export type Npc = z.infer<typeof NpcSchema>;
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;
export type PersistedChoice = z.infer<typeof PersistedChoiceSchema>;
export type Choice = ModelChoice;
export type ArtPrompt = z.infer<typeof ArtPromptSchema>;
export type BgmCue = z.infer<typeof BgmCueSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Safety = z.infer<typeof SafetySchema>;
export type NarrativeOutput = z.infer<typeof NarrativeOutputSchema>;

export interface StoryState {
  sessionId: string;
  chapter: number;
  turn: number;
  tone: string;
  protagonist: {
    name: string;
    traits: string[];
  };
  variables: Record<string, number>;
  inventory: string[];
  knownFacts: string[];
  unresolvedThreads: string[];
  flags: Record<string, boolean>;
  npcRelations: Record<string, number>;
  endingPotential: number;
  styleBible: {
    visualStyle: string;
    musicStyle: string;
  };
}

export interface GameSession {
  id: string;
  userId: string | null;
  seedPrompt: string;
  genre: string;
  language: string;
  rating: string;
  status: "active" | "ended" | "archived";
  currentSceneId: string;
  storyState: StoryState;
  createdAt: string;
  updatedAt: string;
}

export interface AssetJob {
  id: string;
  sessionId: string;
  sceneId: string;
  type: "image" | "bgm";
  provider: string;
  status: "queued" | "generating" | "completed" | "failed";
  promptHash: string;
  promptJson: ArtPrompt | BgmCue;
  url: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
