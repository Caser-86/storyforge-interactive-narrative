import { describe, expect, it } from "vitest";
import { findAffectedNodes } from "@/lib/authoring/impact";
import type { StoryGraph } from "@/lib/authoring/schemas";

const timestamp = "2026-08-21T00:00:00.000Z";
const graph: StoryGraph = {
  versionId: "version-1",
  chapters: [{ id: "chapter-1", versionId: "version-1", ordinal: 0, title: "Chapter", goal: "Goal", summary: "Summary", createdAt: timestamp, updatedAt: timestamp }],
  nodes: ["start", "left", "merge", "ending"].map((id, topologicalRank) => ({
    id,
    versionId: "version-1",
    chapterId: "chapter-1",
    nodeKey: id,
    kind: id === "start" ? "start" : id === "ending" ? "ending" : "scene",
    title: id,
    body: id,
    summary: id,
    objective: id,
    topologicalRank,
    contentStatus: "generated",
    authorModified: false,
    contentRevision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as StoryGraph["nodes"][number])),
  edges: [
    { id: "edge-1", versionId: "version-1", sourceNodeId: "start", targetNodeId: "left", label: "left", intent: "left", consequenceSummary: "left", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: "edge-2", versionId: "version-1", sourceNodeId: "left", targetNodeId: "merge", label: "merge", intent: "merge", consequenceSummary: "merge", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: "edge-3", versionId: "version-1", sourceNodeId: "merge", targetNodeId: "ending", label: "end", intent: "end", consequenceSummary: "end", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
  ],
};

describe("findAffectedNodes", () => {
  it("marks all downstream nodes once and excludes the changed node", () => {
    expect(findAffectedNodes(graph, "left")).toEqual(["merge", "ending"]);
    expect(findAffectedNodes(graph, "ending")).toEqual([]);
  });
});
