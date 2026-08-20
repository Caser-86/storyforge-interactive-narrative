import { enumeratePaths } from "../graph";
import type { StoryGraph, StoryNode } from "../schemas";
import type { ValidationIssueInput } from "./schemas";

export const QUALITY_RULE_THRESHOLDS = {
  similarChoices: 0.72,
  similarEndings: 0.72,
  depthImbalanceRatio: 2,
  repeatedNgramSize: 4,
  repeatedNgramMinimumTokens: 8,
  maxEnumeratedPaths: 1000,
} as const;

export interface DeterministicQualityContext {
  canonFacts?: string[];
  openThreads?: string[];
  resolvedThreads?: string[];
}

type Token = string;

export function runDeterministicRules(graph: StoryGraph, context: DeterministicQualityContext = {}): ValidationIssueInput[] {
  return [
    ...findSimilarChoices(graph),
    ...findRepeatedProse(graph),
    ...findDepthImbalance(graph),
    ...findSimilarEndings(graph),
    ...findMergeFactConflicts(graph, context.canonFacts ?? []),
    ...findMissingThreadResolutions(graph, context.openThreads ?? [], context.resolvedThreads ?? []),
  ];
}

function warning(code: string, message: string, nodeId: string | null = null, edgeId: string | null = null, detailsJson: Record<string, string | number | boolean | null> = {}): ValidationIssueInput {
  return { source: "rule", severity: "warning", code, message, nodeId, edgeId, detailsJson };
}

function findSimilarChoices(graph: StoryGraph): ValidationIssueInput[] {
  const issues: ValidationIssueInput[] = [];
  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((edge) => edge.sourceNodeId === node.id).sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    for (let index = 0; index < outgoing.length; index += 1) {
      for (let next = index + 1; next < outgoing.length; next += 1) {
        const similarity = jaccard(tokenSet(outgoing[index]!.label), tokenSet(outgoing[next]!.label));
        if (similarity < QUALITY_RULE_THRESHOLDS.similarChoices) continue;
        issues.push(warning(
          "SIMILAR_CHOICES",
          `Choices "${outgoing[index]!.label}" and "${outgoing[next]!.label}" are very similar.`,
          node.id,
          outgoing[next]!.id,
          { similarity, comparedEdgeId: outgoing[index]!.id, threshold: QUALITY_RULE_THRESHOLDS.similarChoices },
        ));
      }
    }
  }
  return issues;
}

function findRepeatedProse(graph: StoryGraph): ValidationIssueInput[] {
  const ngramOwners = new Map<string, { nodeId: string; nodeKey: string }>();
  const issues: ValidationIssueInput[] = [];
  for (const node of graph.nodes) {
    const tokens = tokenize(node.body);
    if (tokens.length < QUALITY_RULE_THRESHOLDS.repeatedNgramMinimumTokens) continue;
    const seenInNode = new Set<string>();
    for (let index = 0; index <= tokens.length - QUALITY_RULE_THRESHOLDS.repeatedNgramSize; index += 1) {
      const ngram = tokens.slice(index, index + QUALITY_RULE_THRESHOLDS.repeatedNgramSize).join(" ");
      if (seenInNode.has(ngram)) continue;
      seenInNode.add(ngram);
      const previous = ngramOwners.get(ngram);
      if (previous && previous.nodeId !== node.id) {
        issues.push(warning("REPEATED_PROSE", `Prose repeats a phrase shared with node "${previous.nodeKey}".`, node.id, null, { ngram, comparedNodeId: previous.nodeId, ngramSize: QUALITY_RULE_THRESHOLDS.repeatedNgramSize }));
      } else {
        ngramOwners.set(ngram, { nodeId: node.id, nodeKey: node.nodeKey });
      }
    }
  }
  return uniqueIssues(issues);
}

function findDepthImbalance(graph: StoryGraph): ValidationIssueInput[] {
  const coverage = enumeratePaths(graph, QUALITY_RULE_THRESHOLDS.maxEnumeratedPaths);
  const depths = coverage.paths.map((path) => Math.max(0, path.nodeIds.length - 1));
  if (depths.length < 2) return [];
  const minimum = Math.min(...depths);
  const maximum = Math.max(...depths);
  const ratio = minimum === 0 ? maximum : maximum / minimum;
  if (ratio < QUALITY_RULE_THRESHOLDS.depthImbalanceRatio) return [];
  return [warning("DEPTH_IMBALANCE", `Story paths vary from depth ${minimum} to ${maximum}.`, coverage.startNodeId, null, { minimum, maximum, ratio, threshold: QUALITY_RULE_THRESHOLDS.depthImbalanceRatio, reachedPathCap: coverage.reachedCap })];
}

function findSimilarEndings(graph: StoryGraph): ValidationIssueInput[] {
  const endings = graph.nodes.filter((node) => node.kind === "ending");
  const issues: ValidationIssueInput[] = [];
  for (let index = 0; index < endings.length; index += 1) {
    for (let next = index + 1; next < endings.length; next += 1) {
      const left = endings[index]!;
      const right = endings[next]!;
      const similarity = jaccard(tokenSet(`${left.title} ${left.body} ${left.summary}`), tokenSet(`${right.title} ${right.body} ${right.summary}`));
      if (similarity < QUALITY_RULE_THRESHOLDS.similarEndings) continue;
      issues.push(warning("SIMILAR_ENDINGS", `Endings "${left.title}" and "${right.title}" are very similar.`, right.id, null, { similarity, comparedNodeId: left.id, threshold: QUALITY_RULE_THRESHOLDS.similarEndings }));
    }
  }
  return issues;
}

function findMergeFactConflicts(graph: StoryGraph, canonFacts: string[]): ValidationIssueInput[] {
  const facts = canonFacts.map(parseFact).filter((fact): fact is { key: string; value: string } => fact !== null);
  if (facts.length === 0) return [];
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
  const issues: ValidationIssueInput[] = [];
  for (const node of graph.nodes.filter((candidate) => (incoming.get(candidate.id) ?? 0) > 1)) {
    const text = `${node.title} ${node.body} ${node.summary}`.toLowerCase();
    for (const fact of facts) {
      if (text.includes(fact.key.toLowerCase()) && !text.includes(fact.value.toLowerCase())) {
        issues.push(warning("MERGE_FACT_CONFLICT", `Merge node "${node.nodeKey}" may contradict canon fact "${fact.key}".`, node.id, null, { factKey: fact.key, expectedValue: fact.value }));
      }
    }
  }
  return issues;
}

function findMissingThreadResolutions(graph: StoryGraph, openThreads: string[], resolvedThreads: string[]): ValidationIssueInput[] {
  const resolvedText = `${resolvedThreads.join(" ")} ${graph.nodes.filter((node) => node.kind === "ending").map((node) => `${node.title} ${node.body} ${node.summary}`).join(" ")}`.toLowerCase();
  return openThreads
    .filter((thread) => !resolvedText.includes(thread.toLowerCase()))
    .map((thread) => warning("MISSING_THREAD_RESOLUTION", `Thread "${thread}" has no deterministic resolution in the endings.`, null, null, { thread }));
}

function parseFact(value: string): { key: string; value: string } | null {
  const match = value.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
  if (!match) return null;
  return { key: match[1]!, value: match[2]! };
}

function uniqueIssues(issues: ValidationIssueInput[]): ValidationIssueInput[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.nodeId ?? ""}:${JSON.stringify(issue.detailsJson ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenSet(value: string): Set<Token> {
  return new Set(tokenize(value));
}

function tokenize(value: string): Token[] {
  const normalized = value.normalize("NFKC").toLowerCase();
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!compact) return [];
  if ([...compact].some((character) => /[\p{Script=Han}]/u.test(character))) return [...compact.replace(/\s+/g, "")];
  return compact.split(/\s+/).filter(Boolean);
}

function jaccard(left: Set<Token>, right: Set<Token>): number {
  if (left.size === 0 && right.size === 0) return 1;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return union.size === 0 ? 0 : intersection / union.size;
}
