import { z } from "zod";
import { AuthoringError } from "./errors";
import { StoryNodeKindSchema } from "./schemas";

export const ReaderChapterSchema = z
  .object({
    id: z.string().min(1),
    ordinal: z.number().int().min(0),
    title: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const ReaderStoryNodeSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    nodeKey: z.string().min(1),
    kind: StoryNodeKindSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const ReaderStoryEdgeSchema = z
  .object({
    id: z.string().min(1),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    label: z.string().min(1),
    sortOrder: z.number().int().min(0),
  })
  .strict();

export const ReaderStoryGraphSchema = z
  .object({
    versionId: z.string().min(1),
    chapters: z.array(ReaderChapterSchema),
    nodes: z.array(ReaderStoryNodeSchema),
    edges: z.array(ReaderStoryEdgeSchema),
  })
  .strict();

export const StoryRuntimeStateSchema = z
  .object({
    currentNodeId: z.string().min(1),
    nodePath: z.array(z.string().min(1)),
    edgePath: z.array(z.string().min(1)),
    isEnding: z.boolean(),
  })
  .strict();

export type ReaderChapter = z.infer<typeof ReaderChapterSchema>;
export type ReaderStoryNode = z.infer<typeof ReaderStoryNodeSchema>;
export type ReaderStoryEdge = z.infer<typeof ReaderStoryEdgeSchema>;
export type ReaderStoryGraph = z.infer<typeof ReaderStoryGraphSchema>;
export type StoryRuntimeState = z.infer<typeof StoryRuntimeStateSchema>;

export function createRuntime(graph: ReaderStoryGraph): StoryRuntimeState {
  const startNodes = graph.nodes.filter((node) => node.kind === "start");

  if (startNodes.length !== 1) {
    throw new AuthoringError("VALIDATION", "Runtime graph must contain exactly one start node", {
      startNodeCount: startNodes.length,
    });
  }

  return {
    currentNodeId: startNodes[0].id,
    nodePath: [],
    edgePath: [],
    isEnding: false,
  };
}

export function chooseEdge(
  graph: ReaderStoryGraph,
  state: StoryRuntimeState,
  edgeId: string,
): StoryRuntimeState {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId);

  if (edge === undefined || edge.sourceNodeId !== state.currentNodeId) {
    throw new AuthoringError("VALIDATION", "Choice is not available from the current node", {
      currentNodeId: state.currentNodeId,
      edgeId,
    });
  }

  const targetNode = graph.nodes.find((node) => node.id === edge.targetNodeId);
  if (targetNode === undefined) {
    throw new AuthoringError("VALIDATION", "Choice target node is missing from the runtime graph", {
      edgeId,
      targetNodeId: edge.targetNodeId,
    });
  }

  return {
    currentNodeId: targetNode.id,
    nodePath: [...state.nodePath, targetNode.id],
    edgePath: [...state.edgePath, edge.id],
    isEnding: targetNode.kind === "ending",
  };
}
