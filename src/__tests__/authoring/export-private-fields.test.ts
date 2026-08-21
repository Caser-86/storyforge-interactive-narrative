import { describe, expect, it } from "vitest";
import { renderStandaloneHtml } from "@/lib/authoring/export-html";
import type { ExportStory } from "@/lib/authoring/export-html";

const story: ExportStory = {
  snapshot: { id: "snapshot", projectId: "project", versionNumber: 1, createdAt: "2026-08-21", sealedAt: "2026-08-21" },
  graph: {
    versionId: "snapshot",
    chapters: [{ id: "chapter", ordinal: 0, title: "Chapter", summary: "Summary" }],
    nodes: [
      { id: "start", chapterId: "chapter", nodeKey: "start", kind: "start", title: "Start", body: "Begin", summary: "Begin" },
      { id: "end", chapterId: "chapter", nodeKey: "end", kind: "ending", title: "End", body: "Finish", summary: "Finish" },
    ],
    edges: [{ id: "edge", sourceNodeId: "start", targetNodeId: "end", label: "Continue", sortOrder: 0 }],
  },
};

it("excludes private prompt, provider, authoring, lease, and raw response fields", () => {
  const unsafe = {
    ...story,
    apiKey: "sk-secret",
    baseUrl: "https://user:password@example.test",
    prompt: "PRIVATE_PROMPT",
    objective: "PRIVATE_OBJECTIVE",
    canon: "PRIVATE_CANON",
    authorNotes: "PRIVATE_AUTHOR_NOTES",
    leaseExpiresAt: "PRIVATE_LEASE",
    errorMessage: "PRIVATE_ERROR",
    graph: {
      ...story.graph,
      nodes: story.graph.nodes.map((node) => ({ ...node, rawResponse: "PRIVATE_RAW_RESPONSE", requestJson: "PRIVATE_REQUEST" })),
    },
  } as unknown as ExportStory;

  const html = renderStandaloneHtml(unsafe);

  expect(html).not.toMatch(/sk-secret|user:password|PRIVATE_/);
  expect(html).toContain("Continue");
});
