import { validateStoryGraph } from "../../graph";
import type { StoryGraph, ValidationIssue } from "../../schemas";
import type { GenerationProjectContext } from "../prompts";
import type { GraphOutput } from "./types";

export interface StructuralCheckResult {
  passed: boolean;
  blockingIssues: ValidationIssue[];
  warnings: ValidationIssue[];
  graph: StoryGraph;
}

const STRUCTURAL_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function materializeGraph(context: GenerationProjectContext, graph: GraphOutput): StoryGraph {
  return {
    versionId: context.versionId,
    chapters: graph.chapters.map((chapter, index) => ({
      id: chapter.id,
      versionId: context.versionId,
      ordinal: index,
      title: chapter.title,
      goal: chapter.goal,
      summary: chapter.summary,
      createdAt: STRUCTURAL_TIMESTAMP,
      updatedAt: STRUCTURAL_TIMESTAMP,
    })),
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      versionId: context.versionId,
      chapterId: node.chapterId,
      nodeKey: node.id,
      kind: node.kind,
      title: node.title,
      body: "[pending node content]",
      summary: node.summary,
      objective: node.objective,
      topologicalRank: node.topologicalRank,
      contentStatus: "planned",
      authorModified: false,
      contentRevision: 0,
      createdAt: STRUCTURAL_TIMESTAMP,
      updatedAt: STRUCTURAL_TIMESTAMP,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      versionId: context.versionId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      intent: edge.intent,
      consequenceSummary: edge.consequenceSummary,
      branchType: edge.branchType,
      sortOrder: edge.sortOrder,
      createdAt: STRUCTURAL_TIMESTAMP,
      updatedAt: STRUCTURAL_TIMESTAMP,
    })),
  };
}

export function executeStructuralCheck(context: GenerationProjectContext, graph: GraphOutput): StructuralCheckResult {
  const materialized = materializeGraph(context, graph);
  const issues = validateStoryGraph(materialized, {
    minNodes: 1,
    minEndings: context.size.targetEndings,
    maxNodes: context.size.targetNodes,
    maxEndings: 10,
  });

  return {
    passed: issues.every((issue) => issue.severity !== "blocking"),
    blockingIssues: issues.filter((issue) => issue.severity === "blocking"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    graph: materialized,
  };
}
