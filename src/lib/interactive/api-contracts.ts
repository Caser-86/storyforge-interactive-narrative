import { z } from "zod";
import { ProjectSchema, StoryGraphSchema, StoryVersionSchema } from "@/lib/authoring/schemas";
import { InteractiveSessionSchema } from "./schemas";

export const InteractiveSessionResponseSchema = z
  .object({ session: InteractiveSessionSchema })
  .strict();

export const InteractiveSessionListResponseSchema = z
  .object({ sessions: z.array(InteractiveSessionSchema) })
  .strict();

export const InteractiveChoiceInputSchema = z
  .object({ choiceId: z.string().min(1) })
  .strict();

export const InteractiveMaterializeResponseSchema = z
  .object({
    project: ProjectSchema,
    version: StoryVersionSchema,
    graph: StoryGraphSchema,
    created: z.boolean(),
  })
  .strict();
