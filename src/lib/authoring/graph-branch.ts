import type { StoryGraph } from "./schemas";

export type AuthorBranchDraft = {
  sourceNodeId: string;
  endingNodeId: string;
  choiceLabel: string;
  intent: string;
  consequenceSummary: string;
  continuationLabel: string;
  title: string;
  body: string;
  summary: string;
  objective: string;
};

export type AuthorEndingDraft = {
  sourceNodeId: string;
  choiceLabel: string;
  intent: string;
  consequenceSummary: string;
  title: string;
  body: string;
  summary: string;
  objective: string;
};

export type AuthorBranchIdFactory = (kind: "node" | "edge") => string;

export type AddAuthorBranchOptions = {
  createId: AuthorBranchIdFactory;
  now: string;
};

const fieldLimits = {
  choiceLabel: 240,
  intent: 600,
  consequenceSummary: 800,
  continuationLabel: 240,
  title: 200,
  body: 12_000,
  summary: 600,
  objective: 600,
} as const;

export function addAuthorBranch(graph: StoryGraph, input: AuthorBranchDraft, options: AddAuthorBranchOptions): StoryGraph {
  const sourceNode = graph.nodes.find((node) => node.id === input.sourceNodeId);
  if (!sourceNode) {
    throw new Error("Source node was not found.");
  }
  if (sourceNode.kind === "ending") {
    throw new Error("Cannot add an author branch from an ending node.");
  }

  const sourceEdges = graph.edges.filter((edge) => edge.sourceNodeId === sourceNode.id);
  if (!sourceEdges.some((edge) => edge.branchType === "main")) {
    throw new Error("An author branch requires an existing main path.");
  }

  const endingNode = graph.nodes.find((node) => node.id === input.endingNodeId);
  if (!endingNode || endingNode.kind !== "ending") {
    throw new Error("Author branches must connect to an existing ending.");
  }

  const choiceLabel = requiredText(input.choiceLabel, "choiceLabel", fieldLimits.choiceLabel);
  const intent = requiredText(input.intent, "intent", fieldLimits.intent);
  const consequenceSummary = requiredText(input.consequenceSummary, "consequenceSummary", fieldLimits.consequenceSummary);
  const continuationLabel = requiredText(input.continuationLabel, "continuationLabel", fieldLimits.continuationLabel);
  const title = requiredText(input.title, "title", fieldLimits.title);
  const body = requiredText(input.body, "body", fieldLimits.body);
  const summary = requiredText(input.summary, "summary", fieldLimits.summary);
  const objective = requiredText(input.objective, "objective", fieldLimits.objective);

  if (sourceEdges.some((edge) => edge.label.trim() === choiceLabel)) {
    throw new Error(`The choice label "${choiceLabel}" already exists on this node.`);
  }

  const usedIds = new Set([...graph.nodes.map((node) => node.id), ...graph.edges.map((edge) => edge.id)]);
  const branchNodeId = nextUniqueId(options.createId, "node", usedIds);
  const branchChoiceEdgeId = nextUniqueId(options.createId, "edge", usedIds);
  const continuationEdgeId = nextUniqueId(options.createId, "edge", usedIds);
  const nodeKey = nextNodeKey(graph);
  const sourceSortOrder = sourceEdges.reduce((highest, edge) => Math.max(highest, edge.sortOrder), -1) + 1;

  const branchNode = {
    id: branchNodeId,
    versionId: graph.versionId,
    chapterId: sourceNode.chapterId,
    nodeKey,
    kind: "scene" as const,
    title,
    body,
    summary,
    objective,
    topologicalRank: sourceNode.topologicalRank + 1,
    contentStatus: "review_required" as const,
    authorModified: true,
    contentRevision: 0,
    createdAt: options.now,
    updatedAt: options.now,
  };

  const branchChoiceEdge = {
    id: branchChoiceEdgeId,
    versionId: graph.versionId,
    sourceNodeId: sourceNode.id,
    targetNodeId: branchNode.id,
    label: choiceLabel,
    intent,
    consequenceSummary,
    branchType: "side" as const,
    sortOrder: sourceSortOrder,
    createdAt: options.now,
    updatedAt: options.now,
  };

  const continuationEdge = {
    id: continuationEdgeId,
    versionId: graph.versionId,
    sourceNodeId: branchNode.id,
    targetNodeId: endingNode.id,
    label: continuationLabel,
    intent: `进入结局「${endingNode.title}」`,
    consequenceSummary: `该作者分支将在「${endingNode.title}」处收束。`,
    branchType: "main" as const,
    sortOrder: 0,
    createdAt: options.now,
    updatedAt: options.now,
  };

  return {
    ...graph,
    nodes: [...graph.nodes, branchNode],
    edges: [...graph.edges, branchChoiceEdge, continuationEdge],
  };
}

export function addAuthorEnding(graph: StoryGraph, input: AuthorEndingDraft, options: AddAuthorBranchOptions): StoryGraph {
  const sourceNode = graph.nodes.find((node) => node.id === input.sourceNodeId);
  if (!sourceNode) {
    throw new Error("Source node was not found.");
  }
  if (sourceNode.kind === "ending") {
    throw new Error("Cannot add an author ending from an ending node.");
  }

  const sourceEdges = graph.edges.filter((edge) => edge.sourceNodeId === sourceNode.id);
  const choiceLabel = requiredText(input.choiceLabel, "choiceLabel", fieldLimits.choiceLabel);
  const intent = requiredText(input.intent, "intent", fieldLimits.intent);
  const consequenceSummary = requiredText(input.consequenceSummary, "consequenceSummary", fieldLimits.consequenceSummary);
  const title = requiredText(input.title, "title", fieldLimits.title);
  const body = requiredText(input.body, "body", fieldLimits.body);
  const summary = requiredText(input.summary, "summary", fieldLimits.summary);
  const objective = requiredText(input.objective, "objective", fieldLimits.objective);

  if (sourceEdges.some((edge) => edge.label.trim() === choiceLabel)) {
    throw new Error(`The choice label "${choiceLabel}" already exists on this node.`);
  }

  const usedIds = new Set([...graph.nodes.map((node) => node.id), ...graph.edges.map((edge) => edge.id)]);
  const endingNodeId = nextUniqueId(options.createId, "node", usedIds);
  const endingEdgeId = nextUniqueId(options.createId, "edge", usedIds);
  const createdAt = options.now;
  const endingNode = {
    id: endingNodeId,
    versionId: graph.versionId,
    chapterId: sourceNode.chapterId,
    nodeKey: nextNodeKey(graph, "author-ending"),
    kind: "ending" as const,
    title,
    body,
    summary,
    objective,
    topologicalRank: sourceNode.topologicalRank + 1,
    contentStatus: "review_required" as const,
    authorModified: true,
    contentRevision: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const endingEdge = {
    id: endingEdgeId,
    versionId: graph.versionId,
    sourceNodeId: sourceNode.id,
    targetNodeId: endingNode.id,
    label: choiceLabel,
    intent,
    consequenceSummary,
    branchType: "side" as const,
    sortOrder: sourceEdges.reduce((highest, edge) => Math.max(highest, edge.sortOrder), -1) + 1,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    ...graph,
    nodes: [...graph.nodes, endingNode],
    edges: [...graph.edges, endingEdge],
  };
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function nextUniqueId(createId: AuthorBranchIdFactory, kind: "node" | "edge", usedIds: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = createId(kind);
    if (id.trim().length > 0 && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }

  throw new Error(`Could not create a unique ${kind} id.`);
}

function nextNodeKey(graph: StoryGraph, prefix = "author-branch"): string {
  const keys = new Set(graph.nodes.map((node) => node.nodeKey));
  let index = graph.nodes.length + 1;
  while (keys.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
