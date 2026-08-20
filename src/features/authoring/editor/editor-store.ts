import type { StoryGraph } from "@/lib/authoring/schemas";

export type EditorState = {
  selectedNodeId: string | null;
  collapsedChapterIds: string[];
};

export function initialEditorState(graph: StoryGraph): EditorState {
  const firstNode = [...graph.nodes].sort((left, right) => left.topologicalRank - right.topologicalRank)[0];
  return {
    selectedNodeId: firstNode?.id ?? null,
    collapsedChapterIds: [],
  };
}
