import { z } from "zod";
import {
  ReaderStoryGraphSchema,
  StoryRuntimeStateSchema,
} from "./runtime";
import { StoryVersionSchema } from "./schemas";

export const SnapshotResponseSchema = z.object({ snapshot: StoryVersionSchema }).strict();

export const PreviewResponseSchema = z
  .object({
    snapshot: z
      .object({
        id: z.string().min(1),
        projectId: z.string().min(1),
        versionNumber: z.number().int().min(1),
        createdAt: z.string().min(1),
        sealedAt: z.string().min(1),
      })
      .strict(),
    graph: ReaderStoryGraphSchema,
    runtime: StoryRuntimeStateSchema,
  })
  .strict();

export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;
