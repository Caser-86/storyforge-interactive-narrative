import { describe, expect, it } from "vitest";
import { buildBriefPrompt } from "@/lib/authoring/generation/prompts";

describe("generation prompts", () => {
  it("spells out the strict brief output contract for compatible providers", () => {
    const prompt = buildBriefPrompt({
      projectId: "project-1",
      versionId: "version-1",
      title: "The Impossible Door",
      premise: "An archivist finds a door that should not exist.",
      genre: "mystery",
      tone: "restrained",
      pointOfView: "limited third person",
      rating: "PG-13",
      language: "English",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    expect(prompt).toContain('"title": "string"');
    expect(prompt).toContain('"promise": "string"');
    expect(prompt).toContain('"audience": "string"');
    expect(prompt).toContain("Do not include extra keys");
  });
});
