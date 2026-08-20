import type { StoryGraph } from "../../src/lib/authoring/schemas";

const NOW = "2026-08-19T00:00:00.000Z";

export const manualStoryProjectInput = {
  title: "Manual Lantern Loop",
  premise: "A courier tests a sealed branching story without generation.",
  genre: "clockwork mystery",
  tone: "warm suspense",
  pointOfView: "second person",
  rating: "PG",
  size: {
    preset: "micro",
    targetNodes: 8,
    targetEndings: 2,
  },
  settingsJson: {
    source: "phase-1-e2e",
  },
};

export function manualStoryGraph(versionId: string, sceneBody = "The archive hums while the lantern waits."): StoryGraph {
  const chapterId = `${versionId}-chapter-0`;
  const startId = `${versionId}-node-start`;
  const sceneId = `${versionId}-node-archive`;
  const endingAId = `${versionId}-node-keeper-ending`;
  const endingBId = `${versionId}-node-city-ending`;

  return {
    versionId,
    chapters: [
      {
        id: chapterId,
        versionId,
        ordinal: 0,
        title: "The Lantern Archive",
        goal: "SECRET_GOAL_KEEP_OUT_OF_EXPORT",
        summary: "A hand-authored test branch.",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    nodes: [
      {
        id: startId,
        versionId,
        chapterId,
        nodeKey: "start",
        kind: "start",
        title: "Courtyard Gate",
        body: "You arrive at the brass gate before dawn.",
        summary: "The courier arrives.",
        objective: "SECRET_OBJECTIVE_KEEP_OUT_OF_EXPORT",
        topologicalRank: 0,
        contentStatus: "author_edited",
        authorModified: true,
        contentRevision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: sceneId,
        versionId,
        chapterId,
        nodeKey: "archive",
        kind: "scene",
        title: "Lantern Archive",
        body: sceneBody,
        summary: "The courier chooses what to do with the lantern.",
        objective: "SECRET_OBJECTIVE_KEEP_OUT_OF_EXPORT",
        topologicalRank: 1,
        contentStatus: "author_edited",
        authorModified: true,
        contentRevision: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: endingAId,
        versionId,
        chapterId,
        nodeKey: "keeper-ending",
        kind: "ending",
        title: "Lantern Keeper",
        body: "You keep the lantern safe until the city wakes.",
        summary: "The lantern remains guarded.",
        objective: "SECRET_OBJECTIVE_KEEP_OUT_OF_EXPORT",
        topologicalRank: 2,
        contentStatus: "author_edited",
        authorModified: true,
        contentRevision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: endingBId,
        versionId,
        chapterId,
        nodeKey: "city-ending",
        kind: "ending",
        title: "City of Lamps",
        body: "You share the lantern and every window answers.",
        summary: "The city receives the light.",
        objective: "SECRET_OBJECTIVE_KEEP_OUT_OF_EXPORT",
        topologicalRank: 3,
        contentStatus: "author_edited",
        authorModified: true,
        contentRevision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    edges: [
      {
        id: `${versionId}-edge-start-archive`,
        versionId,
        sourceNodeId: startId,
        targetNodeId: sceneId,
        label: "Enter the archive",
        intent: "SECRET_INTENT_KEEP_OUT_OF_EXPORT",
        consequenceSummary: "SECRET_CONSEQUENCE_KEEP_OUT_OF_EXPORT",
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: `${versionId}-edge-archive-keeper`,
        versionId,
        sourceNodeId: sceneId,
        targetNodeId: endingAId,
        label: "Guard the lantern",
        intent: "SECRET_INTENT_KEEP_OUT_OF_EXPORT",
        consequenceSummary: "SECRET_CONSEQUENCE_KEEP_OUT_OF_EXPORT",
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: `${versionId}-edge-archive-city`,
        versionId,
        sourceNodeId: sceneId,
        targetNodeId: endingBId,
        label: "Share it with the city",
        intent: "SECRET_INTENT_KEEP_OUT_OF_EXPORT",
        consequenceSummary: "SECRET_CONSEQUENCE_KEEP_OUT_OF_EXPORT",
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  };
}
