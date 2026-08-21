import { describe, expect, it } from "vitest";
import {
  buildBiblePrompt,
  buildBriefPrompt,
  buildGraphPrompt,
  buildOutlinePrompt,
} from "@/lib/authoring/generation/prompts";

const context = {
  projectId: "project-1",
  versionId: "version-1",
  title: "The Impossible Door",
  premise: "An archivist finds a door that should not exist.",
  genre: "mystery",
  tone: "restrained",
  pointOfView: "limited third person",
  rating: "PG-13",
  language: "English",
  size: { preset: "micro" as const, targetNodes: 8, targetEndings: 2 },
};

const brief = {
  title: "The Impossible Door",
  premise: "An archivist finds a door that should not exist.",
  promise: "Every discovery changes what the archive can remember.",
  genre: "mystery",
  tone: "restrained",
  audience: "adult mystery readers",
};

const bible = {
  worldRules: ["The archive records only witnessed events."],
  themes: ["Truth has a cost."],
  characters: [{ id: "char-1", name: "Mara", role: "archivist", traits: ["careful"], goal: "Find the door's origin.", secret: "She erased one record." }],
  canonFacts: ["The door appears at midnight."],
  forbiddenChanges: ["Do not make the door ordinary."],
};

const outline = {
  chapters: [{ id: "chapter-1", title: "The Finding", goal: "Find the door.", summary: "Mara discovers the impossible door." }],
  nodes: [{ id: "node-1", chapterId: "chapter-1", kind: "start" as const, title: "The Archive", objective: "Enter the archive." }],
};

describe("generation prompts", () => {
  it("spells out the strict brief output contract for compatible providers", () => {
    const prompt = buildBriefPrompt(context);

    expect(prompt).toContain('"title": "string"');
    expect(prompt).toContain('"promise": "string"');
    expect(prompt).toContain('"audience": "string"');
    expect(prompt).toContain("Do not include extra keys");
  });

  it("spells out strict contracts for the planning stages", () => {
    const biblePrompt = buildBiblePrompt(context, brief);
    const outlinePrompt = buildOutlinePrompt(context, brief, bible);
    const graphPrompt = buildGraphPrompt(context, brief, bible, outline);

    expect(biblePrompt).toContain('"worldRules": ["string"]');
    expect(biblePrompt).toContain('"characters": [{ "id": "string"');
    expect(outlinePrompt).toContain('"chapters": [{ "id": "string"');
    expect(outlinePrompt).toContain('"nodes": [{ "id": "string"');
    expect(graphPrompt).toContain('"branchType": "main | side"');
    expect(graphPrompt).toContain("mainline");
    expect(graphPrompt).toContain("side branch");
    expect(graphPrompt).toContain("Do not include extra keys");
  });
});
