import { z } from "zod";
import {
  ArtPromptSchema,
  BgmCueSchema,
  NpcSchema,
  PersistedChoiceSchema,
  SafetySchema,
} from "./schemas";

export const ApiSceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string(),
  timeOfDay: z.string(),
  mood: z.array(z.string()),
  body: z.string(),
  npcs: z.array(NpcSchema),
  choices: z.array(PersistedChoiceSchema),
  artPrompt: ArtPromptSchema,
  bgmCue: BgmCueSchema,
  chapterGoal: z.string(),
  memorySummary: z.string(),
});

export const AssetStatusSchema = z.enum(["none", "queued", "generating", "completed", "failed"]);

const AssetsSchema = z.object({
  imageJobId: z.string().nullable(),
  imageStatus: AssetStatusSchema,
});

const TimingSchema = z.object({
  llmMs: z.number().optional(),
  totalMs: z.number().optional(),
});

const MetaSchema = z.object({
  usedFallback: z.boolean(),
  llmError: z.string().nullable(),
  inputRewritten: z.boolean().optional(),
  safetyWarnings: z.array(z.string()).optional(),
}).passthrough();

const PlayResponseBaseSchema = z.object({
  sessionId: z.string(),
  scene: ApiSceneSchema,
  safety: SafetySchema,
  assets: AssetsSchema,
  timing: TimingSchema,
  meta: MetaSchema.optional(),
});

export const CreateGameResponseSchema = PlayResponseBaseSchema.extend({
  ownerToken: z.string().min(1),
  statePatch: z.record(z.unknown()),
});

export type CreateGameResponse = z.infer<typeof CreateGameResponseSchema>;

export const ChoiceResponseSchema = PlayResponseBaseSchema.extend({
  previousChoiceId: z.string(),
  stateDiff: z.record(z.number()),
});

export type ChoiceResponse = z.infer<typeof ChoiceResponseSchema>;

export const ExportResponseSchema = z.object({
  session: z.object({
    id: z.string(),
    seedPrompt: z.string(),
    genre: z.string(),
    language: z.string(),
    rating: z.string(),
    status: z.string(),
    state: z.unknown(),
    createdAt: z.union([z.string(), z.date()]),
  }),
  scenes: z.array(ApiSceneSchema.extend({
    turn: z.number(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    choices: z.array(PersistedChoiceSchema.extend({
      chosen: z.boolean().optional(),
    })),
  })),
  exportedAt: z.string(),
});

export type ExportResponse = z.infer<typeof ExportResponseSchema>;

export const ShareReplayResponseSchema = z.object({
  session: z.object({
    seedPrompt: z.string(),
    genre: z.string(),
    rating: z.string(),
  }),
  scenes: z.array(z.object({
    id: z.string(),
    turn: z.number(),
    title: z.string(),
    location: z.string(),
    timeOfDay: z.string(),
    mood: z.array(z.string()),
    body: z.string(),
    npcs: z.array(NpcSchema),
    chapterGoal: z.string().nullable().optional(),
  })),
});

export type ShareReplayResponse = z.infer<typeof ShareReplayResponseSchema>;

export const GetSessionResponseSchema = z.object({
  session: z.object({
    id: z.string(),
    seedPrompt: z.string(),
    genre: z.string(),
    language: z.string(),
    rating: z.string(),
    status: z.string(),
    currentSceneId: z.string(),
    state: z.unknown(),
    createdAt: z.union([z.string(), z.date()]),
    updatedAt: z.union([z.string(), z.date()]),
  }),
  scenes: z.array(ApiSceneSchema.extend({
    turn: z.number(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    choices: z.array(PersistedChoiceSchema.extend({
      chosen: z.boolean(),
    })),
  })),
  assets: z.object({
    imageJobId: z.string().nullable(),
    imageStatus: z.string(),
    imageUrl: z.string().nullable(),
  }),
});

export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;

export function validateResponse<T>(
  schema: { safeParse: (d: unknown) => { success: boolean; error?: { message: string } } },
  data: T,
  label: string
): T {
  if (process.env.NODE_ENV === "development") {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(`[API Contract] ${label} response schema mismatch:`, result.error?.message);
    }
  }
  return data;
}
