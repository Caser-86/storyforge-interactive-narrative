import { describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import {
  StoryEdgePatchSchema,
  StoryEdgeSchema,
  ProjectSizeSchema,
  StoryNodePatchSchema,
  StoryNodeSchema,
  StoryGraphSchema,
  ValidationIssueSchema,
  StoryVersionSchema,
} from "@/lib/authoring/schemas";
import { CreateProjectInputSchema } from "@/lib/authoring/api-contracts";
import type { ProjectSizePreset, StoryNodeKind, VersionKind } from "@/lib/authoring/schemas";

describe("authoring schemas", () => {
  it("exports the locked authoring aliases", () => {
    const sizePreset: ProjectSizePreset = "short";
    const nodeKind: StoryNodeKind = "ending";
    const versionKind: VersionKind = "snapshot";

    expect(sizePreset).toBe("short");
    expect(nodeKind).toBe("ending");
    expect(versionKind).toBe("snapshot");
  });

  it("accepts first-release size presets", () => {
    expect(ProjectSizeSchema.parse({ preset: "short", targetNodes: 24, targetEndings: 4 })).toEqual({
      preset: "short",
      targetNodes: 24,
      targetEndings: 4,
    });
  });

  it("rejects stories larger than the first-release limit", () => {
    expect(() => ProjectSizeSchema.parse({ preset: "custom", targetNodes: 81, targetEndings: 5 })).toThrow();
  });

  it("rejects oversized authoring input before it reaches SQLite or the provider", () => {
    const base = {
      title: "Story",
      premise: "Premise",
      genre: "mystery",
      tone: "quiet",
      pointOfView: "second person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    } as const;

    expect(() => CreateProjectInputSchema.parse({ ...base, title: "x".repeat(121) })).toThrow();
    expect(() => CreateProjectInputSchema.parse({ ...base, premise: "x".repeat(4001) })).toThrow();
    expect(() => CreateProjectInputSchema.parse({ ...base, genre: "x".repeat(81) })).toThrow();
    expect(() => CreateProjectInputSchema.parse({ ...base, tone: "x".repeat(161) })).toThrow();
    expect(() => CreateProjectInputSchema.parse({ ...base, pointOfView: "x".repeat(81) })).toThrow();
    expect(() => CreateProjectInputSchema.parse({ ...base, rating: "x".repeat(33) })).toThrow();
    expect(() => CreateProjectInputSchema.parse({ ...base, settingsJson: "x".repeat(32_001) })).toThrow();
    expect(() => StoryNodePatchSchema.parse({ body: "x".repeat(12_001) })).toThrow();
    expect(() => StoryEdgePatchSchema.parse({ label: "x".repeat(241) })).toThrow();
    expect(() => StoryNodeSchema.parse({
      id: "node-1",
      versionId: "version-1",
      chapterId: "chapter-1",
      nodeKey: "start",
      kind: "start",
      title: "Start",
      body: "x".repeat(12_001),
      summary: "Summary",
      objective: "Objective",
      topologicalRank: 0,
      contentStatus: "planned",
      authorModified: false,
      contentRevision: 0,
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    })).toThrow();
    expect(() => StoryEdgeSchema.parse({
      id: "edge-1",
      versionId: "version-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      label: "x".repeat(241),
      intent: "Intent",
      consequenceSummary: "Consequence",
      branchType: "main",
      sortOrder: 0,
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    })).toThrow();
  });

  it("parses a typed graph payload", () => {
    expect(StoryGraphSchema.parse({ versionId: "v1", chapters: [], nodes: [], edges: [] }).versionId).toBe("v1");
  });

  it("preserves required nullable version keys", () => {
    const parsed = StoryVersionSchema.parse({
      id: "version-1",
      projectId: "project-1",
      versionNumber: 1,
      kind: "draft",
      sourceVersionId: null,
      status: "planning",
      briefJson: null,
      storyBibleJson: [],
      outlineJson: { steps: ["a"] },
      canonJson: { active: true },
      createdAt: "2026-08-19T00:00:00.000Z",
      sealedAt: null,
    });

    expect(parsed).toMatchObject({
      sourceVersionId: null,
      sealedAt: null,
    });
    expect(Object.prototype.hasOwnProperty.call(parsed, "sourceVersionId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "sealedAt")).toBe(true);
  });

  it("preserves required nullable validation issue keys", () => {
    const parsed = ValidationIssueSchema.parse({
      id: "issue-1",
      versionId: "version-1",
      source: "structural",
      severity: "blocking",
      code: "BROKEN_EDGE",
      message: "Broken edge",
      nodeId: null,
      edgeId: null,
      detailsJson: { nested: [1, null, "ok"] },
      status: "open",
      createdAt: "2026-08-19T00:00:00.000Z",
      resolvedAt: null,
    });

    expect(parsed).toMatchObject({
      nodeId: null,
      edgeId: null,
      resolvedAt: null,
    });
    expect(Object.prototype.hasOwnProperty.call(parsed, "nodeId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "edgeId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "resolvedAt")).toBe(true);
  });

  it("rejects invalid size presets", () => {
    expect(() => ProjectSizeSchema.parse({ preset: "long", targetNodes: 24, targetEndings: 4 })).toThrow();
  });

  it("rejects graph payloads missing required fields", () => {
    expect(() => StoryGraphSchema.parse({ chapters: [], nodes: [], edges: [] })).toThrow();
  });

  it("accepts recursive JSON payloads for authoring metadata", () => {
    const parsed = StoryVersionSchema.parse({
      id: "version-2",
      projectId: "project-2",
      versionNumber: 2,
      kind: "snapshot",
      sourceVersionId: "version-1",
      status: "valid",
      briefJson: {
        title: "Story",
        tags: ["mystery", null, { focus: "family" }],
      },
      storyBibleJson: [
        {
          character: "Ava",
          traits: ["curious", "brave"],
        },
      ],
      outlineJson: "outline-v2",
      canonJson: null,
      createdAt: "2026-08-19T00:00:00.000Z",
      sealedAt: "2026-08-19T01:00:00.000Z",
    });

    expect(parsed.briefJson).toEqual({
      title: "Story",
      tags: ["mystery", null, { focus: "family" }],
    });
    expect(parsed.storyBibleJson).toEqual([
      {
        character: "Ava",
        traits: ["curious", "brave"],
      },
    ]);
    expect(parsed.outlineJson).toBe("outline-v2");
    expect(parsed.canonJson).toBeNull();
  });

  it("preserves authoring error code and safe details without serializing stack traces", () => {
    const error = new AuthoringError("VALIDATION", "Graph invalid", { nodeId: "node-1" });

    expect(error.code).toBe("VALIDATION");
    expect(error.message).toBe("Graph invalid");
    expect(error.details).toEqual({ nodeId: "node-1" });

    const serialized = JSON.parse(JSON.stringify(error));
    expect(serialized).toEqual({
      name: "AuthoringError",
      code: "VALIDATION",
      message: "Graph invalid",
      details: { nodeId: "node-1" },
    });
    expect(JSON.stringify(error)).not.toContain("stack");
  });
});
