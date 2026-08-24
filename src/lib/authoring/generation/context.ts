import { AuthoringError } from "../errors";
import type { GraphOutput } from "./stages/types";

export interface NodeSummaryContext {
  nodeId: string;
  title: string;
  summary: string;
  objective: string;
}

export interface SuccessorChoiceContext {
  edgeId: string;
  label: string;
  intent: string;
  consequenceSummary: string;
  branchType: "main" | "side";
  targetNodeId: string;
}

export interface NodeGenerationContext {
  nodeId: string;
  title: string;
  summary: string;
  objective: string;
  predecessorSummaries: NodeSummaryContext[];
  successorChoices: SuccessorChoiceContext[];
}

export function buildNodeContext(graph: GraphOutput, nodeId: string): NodeGenerationContext {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new AuthoringError("NOT_FOUND", "Node not found in generation graph", { nodeId });
  }

  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const parents = incoming.get(edge.targetNodeId) ?? [];
    parents.push(edge.sourceNodeId);
    incoming.set(edge.targetNodeId, parents);
  }

  const predecessorIds = new Set<string>();
  const pending = [...(incoming.get(nodeId) ?? [])];
  while (pending.length > 0) {
    const predecessorId = pending.pop();
    if (!predecessorId || predecessorIds.has(predecessorId) || predecessorId === nodeId) {
      continue;
    }

    predecessorIds.add(predecessorId);
    pending.push(...(incoming.get(predecessorId) ?? []));
  }

  const nodeById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const predecessorSummaries = [...predecessorIds]
    .map((predecessorId) => nodeById.get(predecessorId))
    .filter((candidate): candidate is GraphOutput["nodes"][number] => candidate !== undefined)
    .sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id))
    .map((candidate) => ({
      nodeId: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      objective: candidate.objective,
    }));

  const successorChoices = graph.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((edge) => ({
      edgeId: edge.id,
      label: edge.label,
      intent: edge.intent,
      consequenceSummary: edge.consequenceSummary,
      branchType: edge.branchType,
      targetNodeId: edge.targetNodeId,
    }));

  return {
    nodeId: node.id,
    title: node.title,
    summary: node.summary,
    objective: node.objective,
    predecessorSummaries,
    successorChoices,
  };
}
