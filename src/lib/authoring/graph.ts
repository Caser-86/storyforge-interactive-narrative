import { AuthoringError } from "./errors";
import type { StoryEdge, StoryGraph, StoryNode, ValidationIssue } from "./schemas";

export interface GraphLimits {
  minNodes: number;
  minEndings: number;
  maxNodes: number;
  maxEndings: number;
}

export const RELEASE_GRAPH_LIMITS: GraphLimits = {
  minNodes: 8,
  minEndings: 2,
  maxNodes: 80,
  maxEndings: 10,
};

interface CoveredPath {
  nodeIds: string[];
  edgeIds: string[];
}

export interface PathCoverage {
  cap: number;
  reachedCap: boolean;
  startNodeId: string | null;
  endingNodeIds: string[];
  visitedNodeIds: string[];
  visitedEdgeIds: string[];
  paths: CoveredPath[];
}

interface IssueDraft {
  code: string;
  message: string;
  nodeId?: string | null;
  edgeId?: string | null;
  severity?: ValidationIssue["severity"];
  detailsJson?: ValidationIssue["detailsJson"];
  sortNodeKey?: string;
}

interface GraphIndex {
  nodes: StoryNode[];
  edges: StoryEdge[];
  nodesById: Map<string, StoryNode>;
  startNodes: StoryNode[];
  endingNodes: StoryNode[];
  outgoingValidEdges: Map<string, StoryEdge[]>;
  incomingValidEdges: Map<string, StoryEdge[]>;
}

const ISSUE_CREATED_AT = "1970-01-01T00:00:00.000Z";

export function validateStoryGraph(graph: StoryGraph, limits: GraphLimits): ValidationIssue[] {
  const index = createGraphIndex(graph);
  const issues: Array<IssueDraft & { sortNodeKey: string }> = [];

  if (index.startNodes.length !== 1) {
    issues.push({
      code: "START_COUNT",
      message: `Expected exactly one start node, found ${index.startNodes.length}.`,
      sortNodeKey: "",
    });
  }

  if (index.endingNodes.length === 0) {
    issues.push({
      code: "ENDING_COUNT",
      message: "Expected at least one ending node.",
      sortNodeKey: "",
    });
  }

  if (graph.nodes.length > limits.maxNodes) {
    issues.push({
      code: "NODE_LIMIT",
      message: `Graph has ${graph.nodes.length} nodes but the limit is ${limits.maxNodes}.`,
      sortNodeKey: "",
    });
  }

  if (graph.nodes.length < limits.minNodes) {
    issues.push({
      code: "NODE_MIN_LIMIT",
      message: `Graph has ${graph.nodes.length} nodes but the minimum is ${limits.minNodes}.`,
      sortNodeKey: "",
    });
  }

  if (index.endingNodes.length > limits.maxEndings) {
    issues.push({
      code: "ENDING_LIMIT",
      message: `Graph has ${index.endingNodes.length} endings but the limit is ${limits.maxEndings}.`,
      sortNodeKey: "",
    });
  }

  if (index.endingNodes.length < limits.minEndings) {
    issues.push({
      code: "ENDING_MIN_LIMIT",
      message: `Graph has ${index.endingNodes.length} endings but the minimum is ${limits.minEndings}.`,
      sortNodeKey: "",
    });
  }

  for (const node of index.nodes) {
    if ([node.title, node.body, node.summary, node.objective].some((field) => field.trim().length === 0)) {
      issues.push({
        code: "EMPTY_NODE_CONTENT",
        message: `Node "${node.nodeKey}" is missing required content.`,
        nodeId: node.id,
        sortNodeKey: node.nodeKey,
      });
    }
  }

  for (const edge of index.edges) {
    const sourceNode = index.nodesById.get(edge.sourceNodeId);
    const targetNode = index.nodesById.get(edge.targetNodeId);

    if (sourceNode?.kind === "ending") {
      issues.push({
        code: "ENDING_OUTGOING_EDGE",
        message: `Ending node "${sourceNode.nodeKey}" must not have outgoing edges.`,
        nodeId: sourceNode.id,
        edgeId: edge.id,
        sortNodeKey: sourceNode.nodeKey,
      });
    }

    if (sourceNode !== undefined && edge.label.trim().length === 0) {
      issues.push({
        code: "EMPTY_CHOICE",
        message: `Node "${sourceNode.nodeKey}" has an empty choice label.`,
        nodeId: sourceNode.id,
        edgeId: edge.id,
        sortNodeKey: sourceNode.nodeKey,
      });
    }

    const isBroken =
      edge.versionId !== graph.versionId ||
      sourceNode === undefined ||
      targetNode === undefined ||
      sourceNode.versionId !== graph.versionId ||
      targetNode.versionId !== graph.versionId ||
      sourceNode.versionId !== edge.versionId ||
      targetNode.versionId !== edge.versionId;

    if (isBroken) {
      issues.push({
        code: "BROKEN_EDGE",
        message: `Edge "${edge.id}" does not connect two nodes in version "${graph.versionId}".`,
        edgeId: edge.id,
        sortNodeKey: sourceNode?.nodeKey ?? targetNode?.nodeKey ?? edge.id,
      });
      continue;
    }
  }

  for (const sourceNode of index.nodes) {
    const seenLabels = new Map<string, StoryEdge>();
    const outgoingEdges = [...(index.outgoingValidEdges.get(sourceNode.id) ?? [])].sort((left, right) =>
      compareOutgoingEdges(left, right, index.nodesById),
    );

    for (const edge of outgoingEdges) {
      const trimmedLabel = edge.label.trim();

      if (trimmedLabel.length === 0) {
        continue;
      }

      if (seenLabels.has(trimmedLabel)) {
        issues.push({
          code: "DUPLICATE_CHOICE",
          message: `Node "${sourceNode.nodeKey}" repeats the choice label "${trimmedLabel}".`,
          nodeId: sourceNode.id,
          edgeId: edge.id,
          sortNodeKey: sourceNode.nodeKey,
        });
        continue;
      }

      seenLabels.set(trimmedLabel, edge);
    }
  }

  const cycleNodeIds = findCycleNodeIds(index.nodes, index.outgoingValidEdges, index.nodesById);

  for (const cycleNodeId of cycleNodeIds) {
    const cycleNode = index.nodesById.get(cycleNodeId);

    if (cycleNode === undefined) {
      continue;
    }

    issues.push({
      code: "CYCLE",
      message: `Node "${cycleNode.nodeKey}" participates in a directed cycle.`,
      nodeId: cycleNode.id,
      sortNodeKey: cycleNode.nodeKey,
    });
  }

  if (index.startNodes.length === 1) {
    const reachableNodeIds = findReachableNodeIds(index.startNodes[0].id, index.outgoingValidEdges, index.nodesById);

    for (const node of index.nodes) {
      if (!reachableNodeIds.has(node.id)) {
        issues.push({
          code: "UNREACHABLE_NODE",
          message: `Node "${node.nodeKey}" is unreachable from the start node.`,
          nodeId: node.id,
          sortNodeKey: node.nodeKey,
        });
      }
    }

    for (const nodeId of sortNodeIds(reachableNodeIds, index.nodesById)) {
      const node = index.nodesById.get(nodeId);

      if (node === undefined || node.kind === "ending") {
        continue;
      }

      if ((index.outgoingValidEdges.get(node.id) ?? []).length === 0) {
        issues.push({
          code: "DEAD_END",
          message: `Node "${node.nodeKey}" is reachable but has no outgoing edges.`,
          nodeId: node.id,
          sortNodeKey: node.nodeKey,
        });
      }
    }

    if (index.endingNodes.length > 0) {
      const canReachEndingNodeIds = findReverseReachableNodeIds(
        new Set(index.endingNodes.map((node) => node.id)),
        index.incomingValidEdges,
        index.nodesById,
      );

      for (const nodeId of sortNodeIds(reachableNodeIds, index.nodesById)) {
        const node = index.nodesById.get(nodeId);

        if (node === undefined || canReachEndingNodeIds.has(node.id)) {
          continue;
        }

        issues.push({
          code: "NO_PATH_TO_ENDING",
          message: `Node "${node.nodeKey}" cannot reach any ending.`,
          nodeId: node.id,
          sortNodeKey: node.nodeKey,
        });
      }
    }
  }

  return issues
    .sort((left, right) => compareIssueDrafts(left, right))
    .map((issue) => finalizeIssue(graph.versionId, issue));
}

export function getBlockingGraphIssues(graph: StoryGraph, limits: GraphLimits): ValidationIssue[] {
  return validateStoryGraph(graph, limits).filter((issue) => issue.severity === "blocking");
}

export function topologicalSort(graph: StoryGraph): string[] {
  const index = createGraphIndex(graph);
  const indegreeByNodeId = createIndegreeMap(index.nodes, index.outgoingValidEdges);
  const readyNodeIds = index.nodes
    .filter((node) => (indegreeByNodeId.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort((left, right) => compareNodeIds(left, right, index.nodesById));
  const orderedNodeIds: string[] = [];

  while (readyNodeIds.length > 0) {
    const nodeId = readyNodeIds.shift();

    if (nodeId === undefined) {
      continue;
    }

    orderedNodeIds.push(nodeId);

    for (const edge of [...(index.outgoingValidEdges.get(nodeId) ?? [])].sort((left, right) =>
      compareOutgoingEdges(left, right, index.nodesById),
    )) {
      const nextIndegree = (indegreeByNodeId.get(edge.targetNodeId) ?? 0) - 1;
      indegreeByNodeId.set(edge.targetNodeId, nextIndegree);

      if (nextIndegree === 0) {
        readyNodeIds.push(edge.targetNodeId);
        readyNodeIds.sort((left, right) => compareNodeIds(left, right, index.nodesById));
      }
    }
  }

  if (orderedNodeIds.length !== index.nodes.length) {
    const cycleNodeIds = findCycleNodeIds(index.nodes, index.outgoingValidEdges, index.nodesById);

    throw new AuthoringError("VALIDATION", "Graph contains a directed cycle.", {
      cycleNodeIds,
    });
  }

  return orderedNodeIds;
}

export function enumeratePaths(graph: StoryGraph, cap: number): PathCoverage {
  const index = createGraphIndex(graph);
  const normalizedCap = Math.max(0, Math.trunc(cap));
  const startNodeId = index.startNodes.length === 1 ? index.startNodes[0].id : null;
  const endingNodeIds = index.endingNodes.map((node) => node.id);
  const visitedNodeIds: string[] = [];
  const visitedEdgeIds: string[] = [];
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const paths: CoveredPath[] = [];
  let reachedCap = false;

  if (startNodeId === null) {
    return {
      cap: normalizedCap,
      reachedCap: false,
      startNodeId: null,
      endingNodeIds,
      visitedNodeIds: [],
      visitedEdgeIds: [],
      paths: [],
    };
  }

  const recordNode = (nodeId: string) => {
    if (!seenNodeIds.has(nodeId)) {
      seenNodeIds.add(nodeId);
      visitedNodeIds.push(nodeId);
    }
  };
  const recordEdge = (edgeId: string) => {
    if (!seenEdgeIds.has(edgeId)) {
      seenEdgeIds.add(edgeId);
      visitedEdgeIds.push(edgeId);
    }
  };
  const walk = (nodeId: string, nodeIds: string[], edgeIds: string[], pathNodeIds: Set<string>): boolean => {
    const node = index.nodesById.get(nodeId);

    if (node === undefined) {
      return false;
    }

    if (node.kind === "ending") {
      if (paths.length >= normalizedCap) {
        reachedCap = true;
        return true;
      }

      paths.push({
        nodeIds: [...nodeIds],
        edgeIds: [...edgeIds],
      });
      return false;
    }

    const outgoingEdges = [...(index.outgoingValidEdges.get(nodeId) ?? [])].sort((left, right) =>
      compareOutgoingEdges(left, right, index.nodesById),
    );

    for (let edgeIndex = 0; edgeIndex < outgoingEdges.length; edgeIndex += 1) {
      if (paths.length >= normalizedCap) {
        reachedCap = true;
        return true;
      }

      const edge = outgoingEdges[edgeIndex];
      const targetNode = index.nodesById.get(edge.targetNodeId);

      if (targetNode === undefined || pathNodeIds.has(targetNode.id)) {
        continue;
      }

      recordEdge(edge.id);
      recordNode(targetNode.id);

      const nextPathNodeIds = new Set(pathNodeIds);
      nextPathNodeIds.add(targetNode.id);

      if (walk(targetNode.id, [...nodeIds, targetNode.id], [...edgeIds, edge.id], nextPathNodeIds)) {
        return true;
      }

      if (paths.length >= normalizedCap && edgeIndex < outgoingEdges.length - 1) {
        reachedCap = true;
        return true;
      }
    }

    return false;
  };

  recordNode(startNodeId);
  walk(startNodeId, [startNodeId], [], new Set([startNodeId]));

  return {
    cap: normalizedCap,
    reachedCap,
    startNodeId,
    endingNodeIds,
    visitedNodeIds,
    visitedEdgeIds,
    paths,
  };
}

function createGraphIndex(graph: StoryGraph): GraphIndex {
  const nodes = [...graph.nodes].sort(compareNodes);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = [...graph.edges].sort((left, right) => compareEdges(left, right, nodesById));
  const outgoingValidEdges = new Map<string, StoryEdge[]>();
  const incomingValidEdges = new Map<string, StoryEdge[]>();

  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.sourceNodeId);
    const targetNode = nodesById.get(edge.targetNodeId);
    const isBroken =
      edge.versionId !== graph.versionId ||
      sourceNode === undefined ||
      targetNode === undefined ||
      sourceNode.versionId !== graph.versionId ||
      targetNode.versionId !== graph.versionId ||
      sourceNode.versionId !== edge.versionId ||
      targetNode.versionId !== edge.versionId;

    if (isBroken) {
      continue;
    }

    const outgoingEdges = outgoingValidEdges.get(edge.sourceNodeId) ?? [];
    outgoingEdges.push(edge);
    outgoingValidEdges.set(edge.sourceNodeId, outgoingEdges.sort((left, right) => compareOutgoingEdges(left, right, nodesById)));

    const incomingEdges = incomingValidEdges.get(edge.targetNodeId) ?? [];
    incomingEdges.push(edge);
    incomingValidEdges.set(edge.targetNodeId, incomingEdges.sort((left, right) => compareIncomingEdges(left, right, nodesById)));
  }

  return {
    nodes,
    edges,
    nodesById,
    startNodes: nodes.filter((node) => node.kind === "start"),
    endingNodes: nodes.filter((node) => node.kind === "ending"),
    outgoingValidEdges,
    incomingValidEdges,
  };
}

function compareNodes(left: StoryNode, right: StoryNode): number {
  return left.nodeKey.localeCompare(right.nodeKey) || left.id.localeCompare(right.id);
}

function compareNodeIds(left: string, right: string, nodesById: Map<string, StoryNode>): number {
  const leftNode = nodesById.get(left);
  const rightNode = nodesById.get(right);

  if (leftNode === undefined || rightNode === undefined) {
    return left.localeCompare(right);
  }

  return compareNodes(leftNode, rightNode);
}

function compareEdges(left: StoryEdge, right: StoryEdge, nodesById: Map<string, StoryNode>): number {
  return (
    compareNodeIds(left.sourceNodeId, right.sourceNodeId, nodesById) ||
    left.sortOrder - right.sortOrder ||
    compareNodeIds(left.targetNodeId, right.targetNodeId, nodesById) ||
    left.id.localeCompare(right.id)
  );
}

function compareOutgoingEdges(left: StoryEdge, right: StoryEdge, nodesById: Map<string, StoryNode>): number {
  return (
    left.sortOrder - right.sortOrder ||
    compareNodeIds(left.targetNodeId, right.targetNodeId, nodesById) ||
    left.id.localeCompare(right.id)
  );
}

function compareIncomingEdges(left: StoryEdge, right: StoryEdge, nodesById: Map<string, StoryNode>): number {
  return (
    compareNodeIds(left.sourceNodeId, right.sourceNodeId, nodesById) ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id)
  );
}

function compareIssueDrafts(left: IssueDraft & { sortNodeKey: string }, right: IssueDraft & { sortNodeKey: string }): number {
  return (
    compareSeverity(left.severity ?? "blocking", right.severity ?? "blocking") ||
    left.code.localeCompare(right.code) ||
    left.sortNodeKey.localeCompare(right.sortNodeKey) ||
    (left.edgeId ?? "").localeCompare(right.edgeId ?? "") ||
    (left.nodeId ?? "").localeCompare(right.nodeId ?? "")
  );
}

function compareSeverity(left: ValidationIssue["severity"], right: ValidationIssue["severity"]): number {
  return severityRank(left) - severityRank(right);
}

function severityRank(severity: ValidationIssue["severity"]): number {
  return severity === "blocking" ? 0 : 1;
}

function finalizeIssue(versionId: string, issue: IssueDraft): ValidationIssue {
  return {
    id: [
      "validation",
      issue.code,
      issue.nodeId ?? "graph",
      issue.edgeId ?? "none",
    ].join(":"),
    versionId,
    source: "structural",
    severity: issue.severity ?? "blocking",
    code: issue.code,
    message: issue.message,
    nodeId: issue.nodeId ?? null,
    edgeId: issue.edgeId ?? null,
    detailsJson: issue.detailsJson ?? {},
    status: "open",
    createdAt: ISSUE_CREATED_AT,
    resolvedAt: null,
  };
}

function createIndegreeMap(nodes: StoryNode[], outgoingValidEdges: Map<string, StoryEdge[]>): Map<string, number> {
  const indegreeByNodeId = new Map(nodes.map((node) => [node.id, 0]));

  for (const edges of outgoingValidEdges.values()) {
    for (const edge of edges) {
      indegreeByNodeId.set(edge.targetNodeId, (indegreeByNodeId.get(edge.targetNodeId) ?? 0) + 1);
    }
  }

  return indegreeByNodeId;
}

function findCycleNodeIds(
  nodes: StoryNode[],
  outgoingValidEdges: Map<string, StoryEdge[]>,
  nodesById: Map<string, StoryNode>,
): string[] {
  let nextIndex = 0;
  const indexByNodeId = new Map<string, number>();
  const lowLinkByNodeId = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycleNodeIds = new Set<string>();

  const visit = (nodeId: string): void => {
    indexByNodeId.set(nodeId, nextIndex);
    lowLinkByNodeId.set(nodeId, nextIndex);
    nextIndex += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    const outgoingEdges = [...(outgoingValidEdges.get(nodeId) ?? [])].sort((left, right) =>
      compareOutgoingEdges(left, right, nodesById),
    );

    for (const edge of outgoingEdges) {
      const targetNodeId = edge.targetNodeId;

      if (!indexByNodeId.has(targetNodeId)) {
        visit(targetNodeId);
        lowLinkByNodeId.set(
          nodeId,
          Math.min(lowLinkByNodeId.get(nodeId) ?? Number.POSITIVE_INFINITY, lowLinkByNodeId.get(targetNodeId) ?? 0),
        );
      } else if (onStack.has(targetNodeId)) {
        lowLinkByNodeId.set(
          nodeId,
          Math.min(lowLinkByNodeId.get(nodeId) ?? Number.POSITIVE_INFINITY, indexByNodeId.get(targetNodeId) ?? 0),
        );
      }
    }

    if (lowLinkByNodeId.get(nodeId) !== indexByNodeId.get(nodeId)) {
      return;
    }

    const componentNodeIds: string[] = [];
    let componentNodeId: string | undefined;

    do {
      componentNodeId = stack.pop();

      if (componentNodeId === undefined) {
        break;
      }

      onStack.delete(componentNodeId);
      componentNodeIds.push(componentNodeId);
    } while (componentNodeId !== nodeId);

    if (
      componentNodeIds.length > 1 ||
      (componentNodeIds.length === 1 &&
        outgoingEdges.some((edge) => edge.targetNodeId === componentNodeIds[0]))
    ) {
      for (const componentNodeId of componentNodeIds) {
        cycleNodeIds.add(componentNodeId);
      }
    }
  };

  for (const node of nodes) {
    if (!indexByNodeId.has(node.id)) {
      visit(node.id);
    }
  }

  return [...cycleNodeIds].sort((left, right) => compareNodeIds(left, right, nodesById));
}

function findReachableNodeIds(
  startNodeId: string,
  outgoingValidEdges: Map<string, StoryEdge[]>,
  nodesById: Map<string, StoryNode>,
): Set<string> {
  const reachableNodeIds = new Set<string>();
  const pendingNodeIds = [startNodeId];

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.pop();

    if (nodeId === undefined || reachableNodeIds.has(nodeId)) {
      continue;
    }

    reachableNodeIds.add(nodeId);

    const outgoingEdges = [...(outgoingValidEdges.get(nodeId) ?? [])].sort((left, right) =>
      compareOutgoingEdges(left, right, nodesById),
    );

    for (let edgeIndex = outgoingEdges.length - 1; edgeIndex >= 0; edgeIndex -= 1) {
      pendingNodeIds.push(outgoingEdges[edgeIndex].targetNodeId);
    }
  }

  return reachableNodeIds;
}

function findReverseReachableNodeIds(
  startingNodeIds: Set<string>,
  incomingValidEdges: Map<string, StoryEdge[]>,
  nodesById: Map<string, StoryNode>,
): Set<string> {
  const reachableNodeIds = new Set<string>();
  const pendingNodeIds = [...startingNodeIds].sort((left, right) => compareNodeIds(left, right, nodesById));

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.pop();

    if (nodeId === undefined || reachableNodeIds.has(nodeId)) {
      continue;
    }

    reachableNodeIds.add(nodeId);

    const incomingEdges = [...(incomingValidEdges.get(nodeId) ?? [])].sort((left, right) =>
      compareIncomingEdges(left, right, nodesById),
    );

    for (let edgeIndex = incomingEdges.length - 1; edgeIndex >= 0; edgeIndex -= 1) {
      pendingNodeIds.push(incomingEdges[edgeIndex].sourceNodeId);
    }
  }

  return reachableNodeIds;
}

function sortNodeIds(nodeIds: Set<string>, nodesById: Map<string, StoryNode>): string[] {
  return [...nodeIds].sort((left, right) => compareNodeIds(left, right, nodesById));
}
