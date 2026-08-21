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
  if (output.nodes.filter((node) => node.kind === "ending").length < context.size.targetEndings) {
    throw schemaFailure("Graph does not contain enough ending nodes", { targetEndings: context.size.targetEndings });
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
  const output = providerResult.data;
  validateGraphOutput(context, outline, output);

  const sortedNodes = [...output.nodes].sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id));
  const nextSteps = [
    { stepKey: "structural_check:main", stage: "structural_check" as const, sortOrder: 4 },
    ...sortedNodes.map((node, index) => ({ stepKey: `nodes:${node.id}`, stage: "nodes" as const, subjectId: node.id, sortOrder: 5 + index })),
    { stepKey: "continuity_review:main", stage: "continuity_review" as const, sortOrder: 5 + sortedNodes.length },
  ];

  return { output, providerResult, nextSteps };
}
