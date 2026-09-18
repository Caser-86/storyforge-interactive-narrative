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

const AiReviewEnvelopeSchema = z
  .object({
    passed: z.boolean().optional(),
    issues: z.array(AiReviewIssueSchema).optional(),
    warnings: z.array(AiReviewIssueSchema).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.issues === undefined && value.warnings === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message: "A continuity review must include issues or warnings.",
      });
    }
  })
  .transform((value) => {
    const issues = value.issues ?? value.warnings ?? [];
    return {
      passed: value.passed ?? issues.length === 0,
      issues,
    };
  });

export type AiReviewOutput = z.output<typeof AiReviewEnvelopeSchema>;

export const AiReviewOutputSchema: z.ZodType<AiReviewOutput, z.ZodTypeDef, unknown> = AiReviewEnvelopeSchema;

export type AiReviewCode = z.infer<typeof AiReviewCodeSchema>;
export type AiReviewIssue = z.infer<typeof AiReviewIssueSchema>;
