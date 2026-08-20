import { describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import { chooseEdge, createRuntime } from "@/lib/authoring/runtime";
import type { ReaderStoryGraph } from "@/lib/authoring/runtime";

function readerGraph(): ReaderStoryGraph {
  return {
    versionId: "snapshot-1",
    chapters: [
      {
        id: "chapter-1",
        ordinal: 0,
        title: "Arrival",
        summary: "The reader reaches the archive.",
      },
    ],
    nodes: [
      {
        id: "start",
        chapterId: "chapter-1",
        nodeKey: "start",
        kind: "start",
        title: "At the Archive Gate",
        body: "Two passages open beneath the clocktower.",
        summary: "The reader chooses a passage.",
      },
      {
        id: "left",
        chapterId: "chapter-1",
        nodeKey: "left",
        kind: "scene",
        title: "Left Stair",
        body: "The left stair descends toward green light.",
        summary: "The reader follows the left stair.",
      },
      {
        id: "right",
        chapterId: "chapter-1",
        nodeKey: "right",
        kind: "scene",
        title: "Right Stair",
        body: "The right stair hums with brass insects.",
        summary: "The reader follows the right stair.",
      },
      {
        id: "ending",
        chapterId: "chapter-1",
        nodeKey: "ending",
        kind: "ending",
        title: "Lantern Secured",
        body: "The archive lantern blooms awake.",
        summary: "The reader reaches an ending.",
      },
    ],
    edges: [
      {
        id: "edge_start_left",
        sourceNodeId: "start",
        targetNodeId: "left",
        label: "Take the left stair",
        sortOrder: 0,
      },
      {
        id: "edge_start_right",
        sourceNodeId: "start",
        targetNodeId: "right",
        label: "Take the right stair",
        sortOrder: 1,
      },
      {
        id: "edge_left_ending",
        sourceNodeId: "left",
        targetNodeId: "ending",
        label: "Lift the lantern",
        sortOrder: 0,
      },
    ],
  };
}

describe("reader story runtime", () => {
  it("starts at the single start node with empty paths", () => {
    const state = createRuntime(readerGraph());

    expect(state).toEqual({
      currentNodeId: "start",
      nodePath: [],
      edgePath: [],
      isEnding: false,
    });
  });

  it("moves only along an outgoing edge and records the path", () => {
    const graph = readerGraph();
    const next = chooseEdge(graph, createRuntime(graph), "edge_start_left");

    expect(next.currentNodeId).toBe("left");
    expect(next.nodePath).toEqual(["left"]);
    expect(next.edgePath).toEqual(["edge_start_left"]);
    expect(next.isEnding).toBe(false);
  });

  it("rejects an invalid edge without mutating the original state", () => {
    const graph = readerGraph();
    const state = createRuntime(graph);

    expect(() => chooseEdge(graph, state, "missing-edge")).toThrow(AuthoringError);
    expect(() => chooseEdge(graph, state, "missing-edge")).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
    expect(state).toEqual({
      currentNodeId: "start",
      nodePath: [],
      edgePath: [],
      isEnding: false,
    });
  });

  it("rejects a non-outgoing edge from the current node", () => {
    const graph = readerGraph();
    const state = createRuntime(graph);

    expect(() => chooseEdge(graph, state, "edge_left_ending")).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });

  it("marks the state as ending when the target node is an ending", () => {
    const graph = readerGraph();
    const first = chooseEdge(graph, createRuntime(graph), "edge_start_left");
    const ending = chooseEdge(graph, first, "edge_left_ending");

    expect(ending).toEqual({
      currentNodeId: "ending",
      nodePath: ["left", "ending"],
      edgePath: ["edge_start_left", "edge_left_ending"],
      isEnding: true,
    });
  });
});
