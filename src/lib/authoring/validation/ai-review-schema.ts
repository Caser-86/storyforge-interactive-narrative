import { z } from "zod";

export const AiReviewCodeSchema = z.enum([
  "CHARACTER_CONTRADICTION",
  "TIMELINE_CONTRADICTION",
  "SETTING_CONTRADICTION",
  "ARC_UNRESOLVED",
  "PACING",
  "ENDING_QUALITY",
]);

export const AiReviewIssueSchema = z
  .object({
    code: AiReviewCodeSchema,
    message: z.string().min(1),
    nodeIds: z.array(z.string().min(1)).min(1),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    severity: z.enum(["warning", "blocking"]).optional(),
  })
  .strict();

export const AiReviewOutputSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(AiReviewIssueSchema),
  })
  .strict();

export type AiReviewCode = z.infer<typeof AiReviewCodeSchema>;
export type AiReviewIssue = z.infer<typeof AiReviewIssueSchema>;
export type AiReviewOutput = z.infer<typeof AiReviewOutputSchema>;
