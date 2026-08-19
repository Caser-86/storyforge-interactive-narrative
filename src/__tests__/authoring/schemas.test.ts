import { describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import { ProjectSizeSchema, StoryGraphSchema } from "@/lib/authoring/schemas";

describe("authoring schemas", () => {
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

  it("parses a typed graph payload", () => {
    expect(StoryGraphSchema.parse({ versionId: "v1", chapters: [], nodes: [], edges: [] }).versionId).toBe("v1");
  });

  it("rejects invalid size presets", () => {
    expect(() => ProjectSizeSchema.parse({ preset: "long", targetNodes: 24, targetEndings: 4 })).toThrow();
  });

  it("rejects graph payloads missing required fields", () => {
    expect(() => StoryGraphSchema.parse({ chapters: [], nodes: [], edges: [] })).toThrow();
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
