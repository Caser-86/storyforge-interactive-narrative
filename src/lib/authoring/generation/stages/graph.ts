import type { GenerationProvider } from "../provider";
import type { GenerationProjectContext } from "../prompts";
import { buildGraphPrompt, minimumBranchingNodes, STAGE_MAX_TOKENS, STAGE_SYSTEM_PROMPT } from "../prompts";
import type { BriefOutput, BibleOutput, GraphOutput, OutlineOutput, StageExecutionResult } from "./types";
import { GraphOutputSchema } from "./types";
import { assertUnique, schemaFailure } from "./common";

function validateGraphOutput(context: GenerationProjectContext, outline: OutlineOutput, output: GraphOutput): void {
  assertUnique(output.chapters.map((chapter) => chapter.id), "Graph chapter");
  assertUnique(output.nodes.map((node) => node.id), "Graph node");
  assertUnique(output.edges.map((edge) => edge.id), "Graph edge");

  if (output.nodes.length > context.size.targetNodes) {
    throw schemaFailure("Graph exceeds the project node budget", {
      nodeCount: output.nodes.length,
      targetNodes: context.size.targetNodes,
    });
  }

  const outlineNodeIds = new Set(outline.nodes.map((node) => node.id));
  const graphNodeIds = new Set(output.nodes.map((node) => node.id));
  if (outlineNodeIds.size !== graphNodeIds.size || [...outlineNodeIds].some((nodeId) => !graphNodeIds.has(nodeId))) {
    throw schemaFailure("Graph must reuse the outline node IDs", {
      missing: [...outlineNodeIds].filter((nodeId) => !graphNodeIds.has(nodeId)),
      unexpected: [...graphNodeIds].filter((nodeId) => !outlineNodeIds.has(nodeId)),
    });
  }

  const outlineChapterIds = new Set(outline.chapters.map((chapter) => chapter.id));
  const graphChapterIds = new Set(output.chapters.map((chapter) => chapter.id));
  if (outlineChapterIds.size !== graphChapterIds.size || [...outlineChapterIds].some((chapterId) => !graphChapterIds.has(chapterId))) {
    throw schemaFailure("Graph must reuse the outline chapter IDs");
  }

  const nodeIds = new Set(output.nodes.map((node) => node.id));
  if (output.nodes.filter((node) => node.kind === "start").length !== 1) {
    throw schemaFailure("Graph must contain exactly one start node");
  }
  const endingCount = output.nodes.filter((node) => node.kind === "ending").length;
  if (endingCount !== context.size.targetEndings) {
    throw schemaFailure("Graph must contain exactly the requested ending nodes", {
      endingCount,
      targetEndings: context.size.targetEndings,
    });
  }
  if (output.nodes.some((node) => !graphChapterIds.has(node.chapterId))) {
    throw schemaFailure("Graph node references an unknown chapter");
  }
  for (const edge of output.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw schemaFailure("Graph edge references an unknown node", { edgeId: edge.id });
    }
  }

  const outgoing = new Map<string, typeof output.edges>();
  for (const edge of output.edges) {
    const edges = outgoing.get(edge.sourceNodeId) ?? [];
    edges.push(edge);
    outgoing.set(edge.sourceNodeId, edges);
  }
  const branchingNodeCount = [...outgoing.values()].filter((edges) => edges.length >= 2).length;
  const requiredBranchingNodes = minimumBranchingNodes(context);
  const startNode = output.nodes.find((node) => node.kind === "start");
  const startChoices = startNode ? outgoing.get(startNode.id)?.length ?? 0 : 0;
  if (startChoices < 2) {
    throw schemaFailure("The start node must offer at least two choices", { startChoices });
  }
  const startTargets = new Set((outgoing.get(startNode?.id ?? "") ?? []).map((edge) => edge.targetNodeId));
  if (startTargets.size < 2) {
    throw schemaFailure("The start node choices must lead to distinct nodes", {
      startChoices,
      distinctTargets: startTargets.size,
    });
  }
  if (branchingNodeCount < requiredBranchingNodes) {
    throw schemaFailure("Graph does not contain enough branching decision nodes", {
      requiredBranchingNodes,
      branchingNodeCount,
    });
  }
  for (const [sourceNodeId, edges] of outgoing) {
    if (edges.length < 2) continue;
    const mainEdges = edges.filter((edge) => edge.branchType === "main");
    if (mainEdges.length !== 1) {
      throw schemaFailure("Every branching node must have exactly one main edge", {
        sourceNodeId,
        mainEdgeCount: mainEdges.length,
      });
    }
  }
}

function namespaceGraphOutput(context: GenerationProjectContext, graph: GraphOutput): GraphOutput {
  const prefix = context.versionId;
  const chapterIds = new Map(graph.chapters.map((chapter) => [chapter.id, `${prefix}:${chapter.id}`]));
  const nodeIds = new Map(graph.nodes.map((node) => [node.id, `${prefix}:${node.id}`]));

  return {
    chapters: graph.chapters.map((chapter) => ({
      ...chapter,
      id: chapterIds.get(chapter.id)!,
    })),
    nodes: graph.nodes.map((node) => ({
      ...node,
      id: nodeIds.get(node.id)!,
      chapterId: chapterIds.get(node.chapterId)!,
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      id: `${prefix}:${edge.id}`,
      sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
      targetNodeId: nodeIds.get(edge.targetNodeId)!,
    })),
  };
}

function alignGraphNodesWithOutline(outline: OutlineOutput, graph: GraphOutput): GraphOutput {
  const outlineNodes = new Map(outline.nodes.map((node) => [node.id, node]));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const outlineNode = outlineNodes.get(node.id);
      return outlineNode
        ? { ...node, chapterId: outlineNode.chapterId, kind: outlineNode.kind }
        : node;
    }),
  };
}

function removeEndingOutgoingEdges(graph: GraphOutput): GraphOutput {
  const endingNodeIds = new Set(graph.nodes.filter((node) => node.kind === "ending").map((node) => node.id));
  return {
    ...graph,
    edges: graph.edges.filter((edge) => !endingNodeIds.has(edge.sourceNodeId)),
  };
}

function repairBackwardEdges(graph: GraphOutput): GraphOutput {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const laterNodes = [...graph.nodes]
    .sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id));

  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      const source = nodesById.get(edge.sourceNodeId);
      const target = nodesById.get(edge.targetNodeId);
      if (!source || !target || target.topologicalRank > source.topologicalRank) {
        return edge;
      }

      const replacement = laterNodes.find((node) => node.topologicalRank > source.topologicalRank);
      return replacement ? { ...edge, targetNodeId: replacement.id } : edge;
    }),
  };
}

function repairStartChoices(context: GenerationProjectContext, graph: GraphOutput): GraphOutput {
  const startNode = graph.nodes.find((node) => node.kind === "start");
  if (!startNode) return graph;

  const startEdges = graph.edges.filter((edge) => edge.sourceNodeId === startNode.id);
  if (startEdges.length >= 2) return graph;

  const existingTargets = new Set(startEdges.map((edge) => edge.targetNodeId));
  const candidates = graph.nodes
    .filter((node) => node.id !== startNode.id && node.topologicalRank > startNode.topologicalRank && !existingTargets.has(node.id))
    .sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id));
  if (candidates.length < 2 - startEdges.length) return graph;

  const isChinese = /chinese|zh/i.test(context.language);
  const usedLabels = new Set(startEdges.map((edge) => edge.label));
  const nextSortOrder = Math.max(-1, ...startEdges.map((edge) => edge.sortOrder)) + 1;
  const missingCount = 2 - startEdges.length;
  const repairedEdges = [...graph.edges];
  let hasMain = startEdges.some((edge) => edge.branchType === "main");

  for (let index = 0; index < missingCount; index += 1) {
    const target = candidates[index]!;
    let label = isChinese ? `沿另一条线索前进${index + 1}` : `Follow an alternate lead ${index + 1}`;
    while (usedLabels.has(label)) label += "*";
    usedLabels.add(label);
    const branchType = hasMain ? "side" : "main";
    hasMain = true;
    repairedEdges.push({
      id: `repair:${context.versionId}:start:${index + 1}`,
      sourceNodeId: startNode.id,
      targetNodeId: target.id,
      label,
      intent: isChinese ? "沿另一条线索调查" : "Investigate an alternate lead",
      consequenceSummary: isChinese ? "这条分支通向下一个调查节点。" : "This branch leads to the next investigation node.",
      branchType,
      sortOrder: nextSortOrder + index,
    });
  }

  return { ...graph, edges: repairedEdges };
}

function repairDeadEnds(context: GenerationProjectContext, graph: GraphOutput): GraphOutput {
  const outgoingSources = new Set(graph.edges.map((edge) => edge.sourceNodeId));
  const endings = graph.nodes
    .filter((node) => node.kind === "ending")
    .sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id));
  if (endings.length === 0) return graph;

  const deadEnds = graph.nodes.filter((node) => node.kind !== "ending" && !outgoingSources.has(node.id));
  if (deadEnds.length === 0) return graph;

  const isChinese = /chinese|zh/i.test(context.language);
  const repairedEdges = [...graph.edges];
  for (let index = 0; index < deadEnds.length; index += 1) {
    const source = deadEnds[index]!;
    const target = endings.find((ending) => ending.topologicalRank >= source.topologicalRank) ?? endings[0]!;
    repairedEdges.push({
      id: `repair:${context.versionId}:dead-end:${index + 1}`,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      label: isChinese ? `补齐通往结局的最后一步${index + 1}` : `Take the final step toward an ending ${index + 1}`,
      intent: isChinese ? "面对选择带来的最终结果" : "Face the final consequence of the choice",
      consequenceSummary: isChinese ? "这条路线收束到一个结局。" : "This route closes into an ending.",
      branchType: "main",
      sortOrder: Math.max(-1, ...graph.edges.filter((edge) => edge.sourceNodeId === source.id).map((edge) => edge.sortOrder)) + 1,
    });
  }

  return { ...graph, edges: repairedEdges };
}

export async function executeGraphStage(
  context: GenerationProjectContext,
  provider: GenerationProvider,
  brief: BriefOutput,
  bible: BibleOutput,
  outline: OutlineOutput,
): Promise<StageExecutionResult<GraphOutput>> {
  const providerResult = await provider.generate({
    stage: "graph",
    stepKey: "graph:main",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: buildGraphPrompt(context, brief, bible, outline),
    outputSchema: GraphOutputSchema,
    model: context.model,
    maxTokens: STAGE_MAX_TOKENS.graph,
  });
  const alignedGraph = alignGraphNodesWithOutline(outline, providerResult.data);
  const providerOutput = repairDeadEnds(context, repairStartChoices(context, repairBackwardEdges(removeEndingOutgoingEdges(alignedGraph))));
  validateGraphOutput(context, outline, providerOutput);
  const output = namespaceGraphOutput(context, providerOutput);

  const sortedNodes = [...output.nodes].sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id));
  const nextSteps = [
    { stepKey: "structural_check:main", stage: "structural_check" as const, sortOrder: 4 },
    ...sortedNodes.map((node, index) => ({ stepKey: `nodes:${node.id}`, stage: "nodes" as const, subjectId: node.id, sortOrder: 5 + index })),
    { stepKey: "continuity_review:main", stage: "continuity_review" as const, sortOrder: 5 + sortedNodes.length },
  ];

  return { output, providerResult, nextSteps };
}
