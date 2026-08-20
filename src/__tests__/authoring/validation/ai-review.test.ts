import { describe, expect, it } from "vitest";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import { AiReviewOutputSchema } from "@/lib/authoring/validation/ai-review-schema";
import { runAiContinuityReview, type AiReviewInput } from "@/lib/authoring/validation/ai-review";

function input(provider: FakeGenerationProvider): AiReviewInput {
  return {
    provider,
    model: "deepseek-v4-flash",
    canon: ["Mara cannot breathe underwater."],
    characterCards: ["Mara: cautious archivist"],
    endingSummaries: [{ nodeId: "ending-a", title: "The gate opens", summary: "Mara leaves the archive." }],
    chapters: [
      {
        chapterId: "chapter-1",
        title: "The archive",
        summary: "Mara enters the archive.",
        nodes: [{ nodeId: "node-a", title: "Threshold", body: "Mara enters the archive.", summary: "The door opens." }],
      },
      {
        chapterId: "chapter-2",
        title: "The gate",
        summary: "Mara reaches the gate.",
        nodes: [{ nodeId: "node-b", title: "The gate", body: "Mara reaches the gate.", summary: "The path ends." }],
      },
    ],
  };
}

const warningIssue = {
  code: "CHARACTER_CONTRADICTION",
  message: "Mara acts against her character card.",
  nodeIds: ["node-a"],
  evidence: ["Mara enters the archive."],
  severity: "blocking" as const,
};

describe("AI continuity review", () => {
  it("rejects unknown automatic edit fields and unsupported issue codes", () => {
    expect(AiReviewOutputSchema.safeParse({
      passed: false,
      issues: [{ ...warningIssue, proseEdits: [{ nodeId: "node-a", body: "changed" }] }],
    }).success).toBe(false);

    expect(AiReviewOutputSchema.safeParse({
      passed: false,
      issues: [{ ...warningIssue, code: "REWRITE_NODE" }],
    }).success).toBe(false);
  });

  it("reviews each chapter and then globally, coercing every AI finding to a warning", async () => {
    const provider = new FakeGenerationProvider();
    provider.reply("continuity_review", "ai_review:chapter:chapter-1", { passed: false, issues: [warningIssue] });
    provider.reply("continuity_review", "ai_review:chapter:chapter-2", { passed: true, issues: [] });
    provider.reply("continuity_review", "ai_review:global", {
      passed: false,
      issues: [{ ...warningIssue, code: "ENDING_QUALITY", nodeIds: ["ending-a"], evidence: ["The ending summary closes too quickly."] }],
    });

    const reviewInput = input(provider);
    const originalBodies = reviewInput.chapters.map((chapter) => chapter.nodes.map((node) => node.body));
    const result = await runAiContinuityReview(reviewInput);

    expect(provider.allCalls().map((call) => call.stepKey)).toEqual([
      "ai_review:chapter:chapter-1",
      "ai_review:chapter:chapter-2",
      "ai_review:global",
    ]);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((issue) => issue.source === "ai_review" && issue.severity === "warning")).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual(["CHARACTER_CONTRADICTION", "ENDING_QUALITY"]);
    expect(result.issues[0]?.nodeId).toBe("node-a");
    expect(result.issues[0]?.detailsJson).toEqual(expect.objectContaining({ evidence: ["Mara enters the archive."] }));
    expect(reviewInput.chapters.map((chapter) => chapter.nodes.map((node) => node.body))).toEqual(originalBodies);
  });

  it("fails closed when a provider returns a prose edit request", async () => {
    const provider = new FakeGenerationProvider();
    provider.reply("continuity_review", "ai_review:chapter:chapter-1", {
      passed: false,
      issues: [],
      proseEdits: [{ nodeId: "node-a", body: "Do not apply this." }],
    });

    await expect(runAiContinuityReview(input(provider))).rejects.toMatchObject({ code: "SCHEMA" });
  });
});
