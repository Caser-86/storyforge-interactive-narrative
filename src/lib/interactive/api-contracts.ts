import { z } from "zod";
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
