import type { StoryGraph } from "./schemas";

/** Returns every node reachable after the changed node, excluding the source itself. */
export function findAffectedNodes(graph: StoryGraph, changedNodeId: string): string[] {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }

  const affected = new Set<string>();
  const queue = [...(outgoing.get(changedNodeId) ?? [])];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || affected.has(nodeId) || nodeId === changedNodeId) continue;
    affected.add(nodeId);
    queue.push(...(outgoing.get(nodeId) ?? []));
  }

  return [...affected].sort((left, right) => {
    const leftRank = graph.nodes.find((node) => node.id === left)?.topologicalRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = graph.nodes.find((node) => node.id === right)?.topologicalRank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.localeCompare(right);
  });
}
