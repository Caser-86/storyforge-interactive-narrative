import { z } from "zod";
import { ProjectSchema, StoryGraphSchema, StoryVersionSchema } from "@/lib/authoring/schemas";
import { InteractiveSessionSchema, InteractiveSessionSummarySchema, InteractiveTurnRecordSchema } from "./schemas";

export const InteractiveSessionResponseSchema = z
  .object({ session: InteractiveSessionSchema })
  .strict();

export const InteractiveSessionListResponseSchema = z
  .object({ sessions: z.array(InteractiveSessionSummarySchema), nextCursor: z.string().min(1).nullable() })
  .strict();

export const InteractiveTurnsResponseSchema = z
  .object({ turns: z.array(InteractiveTurnRecordSchema) })
  .strict();

export const InteractiveChoiceInputSchema = z
  .object({ choiceId: z.string().min(1), expectedTurn: z.number().int().min(1) })
  .strict();

export const InteractiveMaterializeResponseSchema = z
  .object({
    project: ProjectSchema,
    version: StoryVersionSchema,
    graph: StoryGraphSchema,
    created: z.boolean(),
  })
  .strict();
