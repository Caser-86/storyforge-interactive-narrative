import { enumeratePaths } from "../graph";
import type { StoryEdge, StoryGraph } from "../schemas";

export interface PathCoverageReport {
  cap: number;
  reachedCap: boolean;
  paths: Array<{ nodeIds: string[]; edgeIds: string[] }>;
  uncoveredNodeIds: string[];
  uncoveredEdgeIds: string[];
  passed: boolean;
}

export function buildPathCoverageReport(graph: StoryGraph, cap: number): PathCoverageReport {
  const enumerated = enumeratePaths(graph, cap);
  const paths = enumerated.paths.map((path) => ({ nodeIds: [...path.nodeIds], edgeIds: [...path.edgeIds] }));
  const coveredNodeIds = new Set(enumerated.visitedNodeIds);
  const coveredEdgeIds = new Set(enumerated.visitedEdgeIds);
  const adjacency = buildAdjacency(graph);

  if (enumerated.reachedCap && enumerated.startNodeId !== null) {
    for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
      if (coveredNodeIds.has(node.id)) continue;
      const path = findPath(enumerated.startNodeId, node.id, adjacency, new Set());
      if (path) addPath(path, paths, coveredNodeIds, coveredEdgeIds);
    }
    for (const edge of [...graph.edges].sort((left, right) => left.id.localeCompare(right.id))) {
      if (coveredEdgeIds.has(edge.id)) continue;
      const path = findPath(enumerated.startNodeId, edge.sourceNodeId, adjacency, new Set());
      if (!path) continue;
      addPath({ nodeIds: [...path.nodeIds, edge.targetNodeId], edgeIds: [...path.edgeIds, edge.id] }, paths, coveredNodeIds, coveredEdgeIds);
    }
  }

  const uncoveredNodeIds = graph.nodes.map((node) => node.id).filter((id) => !coveredNodeIds.has(id)).sort();
  const uncoveredEdgeIds = graph.edges.map((edge) => edge.id).filter((id) => !coveredEdgeIds.has(id)).sort();
  return {
    cap: enumerated.cap,
    reachedCap: enumerated.reachedCap,
    paths,
    uncoveredNodeIds,
    uncoveredEdgeIds,
    passed: uncoveredNodeIds.length === 0 && uncoveredEdgeIds.length === 0,
  };
}

type CoveragePath = { nodeIds: string[]; edgeIds: string[] };

function buildAdjacency(graph: StoryGraph): Map<string, StoryEdge[]> {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const adjacency = new Map<string, StoryEdge[]>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    const edges = adjacency.get(edge.sourceNodeId) ?? [];
    edges.push(edge);
    adjacency.set(edge.sourceNodeId, edges);
  }
  for (const edges of adjacency.values()) edges.sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  return adjacency;
}

function findPath(startNodeId: string, targetNodeId: string, adjacency: Map<string, StoryEdge[]>, visited: Set<string>): CoveragePath | null {
  if (startNodeId === targetNodeId) return { nodeIds: [startNodeId], edgeIds: [] };
  if (visited.has(startNodeId)) return null;
  const nextVisited = new Set(visited).add(startNodeId);
  for (const edge of adjacency.get(startNodeId) ?? []) {
    if (nextVisited.has(edge.targetNodeId)) continue;
    const suffix = findPath(edge.targetNodeId, targetNodeId, adjacency, nextVisited);
    if (suffix) return { nodeIds: [startNodeId, ...suffix.nodeIds], edgeIds: [edge.id, ...suffix.edgeIds] };
  }
  return null;
}

function addPath(path: CoveragePath, paths: CoveragePath[], coveredNodeIds: Set<string>, coveredEdgeIds: Set<string>): void {
  paths.push(path);
  for (const nodeId of path.nodeIds) coveredNodeIds.add(nodeId);
  for (const edgeId of path.edgeIds) coveredEdgeIds.add(edgeId);
}
