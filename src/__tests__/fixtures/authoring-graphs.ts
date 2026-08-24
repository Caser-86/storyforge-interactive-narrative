import type { Chapter, StoryEdge, StoryGraph, StoryNode } from "@/lib/authoring/schemas";

import type { GraphLimits } from "@/lib/authoring/graph";

const VERSION_ID = "version-1";
const CHAPTER_ID = "chapter-1";
const NOW = "2026-08-19T00:00:00.000Z";

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: CHAPTER_ID,
    versionId: VERSION_ID,
    ordinal: 0,
    title: "Act 1",
    goal: "Reach the lantern archive.",
    summary: "The courier enters a branching ruin.",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function node(nodeKey: string, kind: StoryNode["kind"], overrides: Partial<StoryNode> = {}): StoryNode {
  return {
    id: `node-${nodeKey}`,
    versionId: VERSION_ID,
    chapterId: CHAPTER_ID,
    nodeKey,
    kind,
    title: `${nodeKey} title`,
    body: `${nodeKey} body`,
    summary: `${nodeKey} summary`,
    objective: `${nodeKey} objective`,
    topologicalRank: 0,
    contentStatus: "planned",
    authorModified: false,
    contentRevision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function edge(
  sourceNodeId: string,
  targetNodeId: string,
  label: string,
  sortOrder: number,
  overrides: Partial<StoryEdge> = {},
): StoryEdge {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}-${sortOrder}`,
    versionId: VERSION_ID,
    sourceNodeId,
    targetNodeId,
    label,
    intent: `intent-${sortOrder}`,
    consequenceSummary: `consequence-${sortOrder}`,
    branchType: sortOrder === 0 ? "main" : "side",
    sortOrder,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function graph(nodes: StoryNode[], edges: StoryEdge[]): StoryGraph {
  return {
    versionId: VERSION_ID,
    chapters: [chapter()],
    nodes,
    edges,
  };
}

export function testLimits(overrides: Partial<GraphLimits> = {}): GraphLimits {
  return {
    minNodes: 1,
    minEndings: 1,
    maxNodes: 80,
    maxEndings: 10,
    ...overrides,
  };
}

export function validReleaseGraph(): StoryGraph {
  const start = node("start", "start");
  const left = node("left", "scene", { topologicalRank: 1 });
  const leftDetail = node("left-detail", "scene", { topologicalRank: 2 });
  const right = node("right", "scene", { topologicalRank: 1 });
  const rightDetail = node("right-detail", "scene", { topologicalRank: 2 });
  const merge = node("merge", "scene", { topologicalRank: 3 });
  const keeperEnding = node("keeper-ending", "ending", { topologicalRank: 4 });
  const cityEnding = node("city-ending", "ending", { topologicalRank: 4 });

  return graph(
    [start, left, leftDetail, right, rightDetail, merge, keeperEnding, cityEnding],
    [
      edge(start.id, left.id, "Take the left stair", 0, { id: "edge-start-left" }),
      edge(start.id, right.id, "Take the right stair", 1, { id: "edge-start-right" }),
      edge(left.id, leftDetail.id, "Search the left gallery", 0, { id: "edge-left-detail" }),
      edge(leftDetail.id, merge.id, "Return to the archive", 0, { id: "edge-left-merge" }),
      edge(right.id, rightDetail.id, "Search the right gallery", 0, { id: "edge-right-detail" }),
      edge(rightDetail.id, merge.id, "Return to the archive", 0, { id: "edge-right-merge" }),
      edge(merge.id, keeperEnding.id, "Keep the lantern", 0, { id: "edge-merge-keeper" }),
      edge(merge.id, cityEnding.id, "Share the lantern", 1, { id: "edge-merge-city" }),
    ],
  );
}

export function validConvergingGraph(): StoryGraph {
  const start = node("start", "start");
  const left = node("left", "scene", { topologicalRank: 1 });
  const right = node("right", "scene", { topologicalRank: 1 });
  const merge = node("merge", "scene", { topologicalRank: 2 });
  const ending = node("ending", "ending", { topologicalRank: 3 });

  return graph(
    [start, left, right, merge, ending],
    [
      edge(start.id, left.id, "Take the left stair", 0, { id: "edge-start-left" }),
      edge(start.id, right.id, "Take the right stair", 1, { id: "edge-start-right" }),
      edge(left.id, merge.id, "Continue to the archive", 0, { id: "edge-left-merge" }),
      edge(right.id, merge.id, "Continue to the archive", 0, { id: "edge-right-merge" }),
      edge(merge.id, ending.id, "Secure the lantern", 0, { id: "edge-merge-ending" }),
    ],
  );
}

export function graphWithoutStart(): StoryGraph {
  const scene = node("scene-a", "scene");
  const ending = node("ending", "ending", { topologicalRank: 1 });

  return graph([scene, ending], [edge(scene.id, ending.id, "Finish", 0, { id: "edge-scene-ending" })]);
}

export function graphWithoutEnding(): StoryGraph {
  const start = node("start", "start");
  const scene = node("scene-a", "scene", { topologicalRank: 1 });

  return graph([start, scene], [edge(start.id, scene.id, "Keep going", 0, { id: "edge-start-scene" })]);
}

export function graphWithCycle(): StoryGraph {
  const start = node("start", "start");
  const loop = node("loop", "scene", { topologicalRank: 1 });
  const ending = node("ending", "ending", { topologicalRank: 2 });

  return graph(
    [start, loop, ending],
    [
      edge(start.id, loop.id, "Enter the vault", 0, { id: "edge-start-loop" }),
      edge(loop.id, start.id, "Retreat to the atrium", 0, { id: "edge-loop-start" }),
      edge(loop.id, ending.id, "Break the cycle", 1, { id: "edge-loop-ending" }),
    ],
  );
}

export function graphWithCycleAndAcyclicTail(): StoryGraph {
  const start = node("start", "start");
  const a = node("a", "scene", { topologicalRank: 1 });
  const b = node("b", "scene", { topologicalRank: 2 });
  const c = node("c", "scene", { topologicalRank: 3 });
  const ending = node("ending", "ending", { topologicalRank: 4 });

  return graph(
    [start, a, b, c, ending],
    [
      edge(start.id, a.id, "Enter the loop", 0, { id: "edge-start-a" }),
      edge(a.id, b.id, "Advance", 0, { id: "edge-a-b" }),
      edge(b.id, a.id, "Return", 0, { id: "edge-b-a" }),
      edge(a.id, c.id, "Take the exit", 1, { id: "edge-a-c" }),
      edge(c.id, ending.id, "Finish", 0, { id: "edge-c-ending" }),
    ],
  );
}

export function graphWithOrphan(): StoryGraph {
  const base = validConvergingGraph();
  const orphan = node("orphan", "scene", { topologicalRank: 99 });

  return graph([...base.nodes, orphan], base.edges);
}

export function graphWithDeadEnd(): StoryGraph {
  const start = node("start", "start");
  const deadEnd = node("dead-end", "scene", { topologicalRank: 1 });
  const ending = node("ending", "ending", { topologicalRank: 2 });

  return graph(
    [start, deadEnd, ending],
    [
      edge(start.id, deadEnd.id, "Investigate the dark hall", 0, { id: "edge-start-dead-end" }),
      edge(start.id, ending.id, "Abort the mission", 1, { id: "edge-start-ending" }),
    ],
  );
}

export function graphWithTrappedBranch(): StoryGraph {
  const start = node("start", "start");
  const left = node("left", "scene", { topologicalRank: 1 });
  const trap = node("trap", "scene", { topologicalRank: 2 });
  const culdesac = node("culdesac", "scene", { topologicalRank: 3 });
  const ending = node("ending", "ending", { topologicalRank: 4 });

  return graph(
    [start, left, trap, culdesac, ending],
    [
      edge(start.id, left.id, "Take the lit path", 0, { id: "edge-start-left" }),
      edge(start.id, trap.id, "Take the sealed path", 1, { id: "edge-start-trap" }),
      edge(left.id, ending.id, "Exit the archive", 0, { id: "edge-left-ending" }),
      edge(trap.id, culdesac.id, "Push deeper", 0, { id: "edge-trap-culdesac" }),
    ],
  );
}

export function graphWithBrokenEdge(): StoryGraph {
  const start = node("start", "start");
  const ending = node("ending", "ending", { topologicalRank: 1 });

  return graph(
    [start, ending],
    [
      edge(start.id, ending.id, "Finish the scene", 0, { id: "edge-start-ending" }),
      edge(start.id, "node-missing", "Jump to nowhere", 1, { id: "edge-start-missing" }),
    ],
  );
}

export function graphWithDuplicateChoices(): StoryGraph {
  const start = node("start", "start");
  const left = node("left", "scene", { topologicalRank: 1 });
  const right = node("right", "scene", { topologicalRank: 1 });
  const ending = node("ending", "ending", { topologicalRank: 2 });

  return graph(
    [start, left, right, ending],
    [
      edge(start.id, left.id, "Listen", 0, { id: "edge-start-left" }),
      edge(start.id, right.id, "Listen", 1, { id: "edge-start-right" }),
      edge(left.id, ending.id, "End left branch", 0, { id: "edge-left-ending" }),
      edge(right.id, ending.id, "End right branch", 0, { id: "edge-right-ending" }),
    ],
  );
}

export function graphWithEmptyChoice(): StoryGraph {
  const start = node("start", "start");
  const ending = node("ending", "ending", { topologicalRank: 1 });

  return graph([start, ending], [edge(start.id, ending.id, "   ", 0, { id: "edge-start-ending" })]);
}

export function graphWithEndingOutgoingEdge(): StoryGraph {
  const start = node("start", "start");
  const ending = node("ending", "ending", { topologicalRank: 1 });
  const postscript = node("postscript", "scene", { topologicalRank: 2 });

  return graph(
    [start, ending, postscript],
    [
      edge(start.id, ending.id, "End the story", 0, { id: "edge-start-ending" }),
      edge(ending.id, postscript.id, "Continue anyway", 0, { id: "edge-ending-postscript" }),
    ],
  );
}

export function graphWithEmptyNodeContent(): StoryGraph {
  const start = node("start", "start", { title: " ", body: "", summary: " ", objective: "" });
  const ending = node("ending", "ending", { topologicalRank: 1 });

  return graph([start, ending], [edge(start.id, ending.id, "Finish", 0, { id: "edge-start-ending" })]);
}

export function graphOverNodeLimit(): StoryGraph {
  const base = validConvergingGraph();
  const overflow = node("overflow", "ending", { topologicalRank: 4 });

  return graph([...base.nodes, overflow], base.edges);
}

export function graphOverEndingLimit(): StoryGraph {
  const start = node("start", "start");
  const endingA = node("ending-a", "ending", { topologicalRank: 1 });
  const endingB = node("ending-b", "ending", { topologicalRank: 1 });

  return graph(
    [start, endingA, endingB],
    [
      edge(start.id, endingA.id, "Choose dawn", 0, { id: "edge-start-ending-a" }),
      edge(start.id, endingB.id, "Choose dusk", 1, { id: "edge-start-ending-b" }),
    ],
  );
}

export function graphWithMultipleIssues(): StoryGraph {
  const start = node("start", "start");
  const ending = node("ending", "ending", { topologicalRank: 1 });
  const alpha = node("alpha", "scene", { topologicalRank: 2, title: " " });
  const beta = node("beta", "scene", { topologicalRank: 3 });

  return graph(
    [start, ending, alpha, beta],
    [
      edge(start.id, ending.id, "Complete the mission", 0, { id: "edge-start-ending" }),
      edge(start.id, alpha.id, "  ", 1, { id: "edge-start-alpha" }),
      edge(start.id, beta.id, "Repeat", 2, { id: "edge-start-beta" }),
      edge(start.id, ending.id, "Repeat", 3, { id: "edge-start-ending-duplicate" }),
      edge(alpha.id, ending.id, "Recover the route", 0, { id: "edge-alpha-ending" }),
      edge(beta.id, ending.id, "Recover the route", 0, { id: "edge-beta-ending" }),
    ],
  );
}

export function graphWithThreePaths(): StoryGraph {
  const start = node("start", "start");
  const left = node("left", "scene", { topologicalRank: 1 });
  const middle = node("middle", "scene", { topologicalRank: 1 });
  const right = node("right", "scene", { topologicalRank: 1 });
  const ending = node("ending", "ending", { topologicalRank: 2 });

  return graph(
    [start, left, middle, right, ending],
    [
      edge(start.id, left.id, "Go left", 0, { id: "edge-start-left" }),
      edge(start.id, middle.id, "Go middle", 1, { id: "edge-start-middle" }),
      edge(start.id, right.id, "Go right", 2, { id: "edge-start-right" }),
      edge(left.id, ending.id, "Finish left", 0, { id: "edge-left-ending" }),
      edge(middle.id, ending.id, "Finish middle", 0, { id: "edge-middle-ending" }),
      edge(right.id, ending.id, "Finish right", 0, { id: "edge-right-ending" }),
    ],
  );
}
