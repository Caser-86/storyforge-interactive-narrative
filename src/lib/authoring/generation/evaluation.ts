import { z } from "zod";
import { GraphOutputSchema } from "./stages/types";
import type { GraphOutput } from "./stages/types";
import { NodeContentOutputSchema } from "./stages/nodes";

export const EvaluationFixtureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  genre: z.string().min(1),
  language: z.enum(["zh-CN"]),
  targetNodes: z.number().int().min(8).max(80),
  targetEndings: z.number().int().min(2).max(10),
  minimumDecisionPoints: z.number().int().min(1).max(20),
  requiredTerms: z.array(z.string().min(1)).min(1),
  expectedOutcome: z.enum(["completed", "canceled", "budget-paused"]).default("completed"),
}).strict();

export type EvaluationFixture = z.infer<typeof EvaluationFixtureSchema>;

const EvaluationCandidateSchema = z.object({
  graph: z.unknown(),
  nodeContents: z.unknown(),
  outcome: z.enum(["completed", "canceled", "budget-paused", "failed"]),
  retryCount: z.number().int().min(0).max(1000).default(0),
  latencyMs: z.number().int().min(0).max(86_400_000).default(0),
}).strict();

export type EvaluationCandidate = z.input<typeof EvaluationCandidateSchema>;

export const EvaluationResultSchema = z.object({
  schema: z.literal("storyforge-evaluation@1"),
  policyVersion: z.literal("generation-evaluation@1"),
  fixtureId: z.string().min(1),
  passed: z.boolean(),
  structuralPass: z.boolean(),
  choiceContractPass: z.boolean(),
  endingContractPass: z.boolean(),
  languageMatch: z.boolean(),
  schemaFailure: z.boolean(),
  expectedOutcomeObserved: z.boolean(),
  retryCount: z.number().int().min(0),
  latencyMs: z.number().int().min(0),
  issueCodes: z.array(z.string().min(1)),
}).strict();

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

function chineseRatio(value: string): number {
  const characters = [...value].filter((character) => /[\u3400-\u9fff]/u.test(character));
  const letters = [...value].filter((character) => /[\p{L}\p{N}]/u.test(character));
  return letters.length === 0 ? 0 : characters.length / letters.length;
}

function textFromCandidate(graph: z.infer<typeof GraphOutputSchema>, contents: z.infer<typeof NodeContentOutputSchema>[]): string {
  return [
    ...graph.chapters.flatMap((chapter) => [chapter.title, chapter.goal, chapter.summary]),
    ...graph.nodes.flatMap((node) => [node.title, node.objective, node.summary]),
    ...graph.edges.flatMap((edge) => [edge.label, edge.intent, edge.consequenceSummary]),
    ...contents.flatMap((content) => [content.body, content.summary, content.objective]),
  ].join(" ");
}

export function evaluateCandidate(fixtureInput: unknown, candidateInput: unknown): EvaluationResult {
  const fixture = EvaluationFixtureSchema.parse(fixtureInput);
  const candidate = EvaluationCandidateSchema.safeParse(candidateInput);
  if (!candidate.success) {
    return EvaluationResultSchema.parse({
      schema: "storyforge-evaluation@1",
      policyVersion: "generation-evaluation@1",
      fixtureId: fixture.id,
      passed: false,
      structuralPass: false,
      choiceContractPass: false,
      endingContractPass: false,
      languageMatch: false,
      schemaFailure: true,
      expectedOutcomeObserved: false,
      retryCount: 0,
      latencyMs: 0,
      issueCodes: ["CANDIDATE_SCHEMA"],
    });
  }

  const graphResult = GraphOutputSchema.safeParse(candidate.data.graph);
  const contentsResult = z.array(NodeContentOutputSchema).safeParse(candidate.data.nodeContents);
  const issueCodes: string[] = [];
  if (!graphResult.success || !contentsResult.success) issueCodes.push("OUTPUT_SCHEMA");
  if (candidate.data.outcome !== fixture.expectedOutcome) issueCodes.push("UNEXPECTED_OUTCOME");
  if (!graphResult.success || !contentsResult.success) {
    return EvaluationResultSchema.parse({
      schema: "storyforge-evaluation@1",
      policyVersion: "generation-evaluation@1",
      fixtureId: fixture.id,
      passed: false,
      structuralPass: false,
      choiceContractPass: false,
      endingContractPass: false,
      languageMatch: false,
      schemaFailure: true,
      expectedOutcomeObserved: candidate.data.outcome === fixture.expectedOutcome,
      retryCount: candidate.data.retryCount,
      latencyMs: candidate.data.latencyMs,
      issueCodes: [...new Set(issueCodes)],
    });
  }

  const graph = graphResult.data;
  const contents = contentsResult.data;
  const outgoing = new Map<string, number>();
  for (const edge of graph.edges) outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) ?? 0) + 1);
  const endings = graph.nodes.filter((node) => node.kind === "ending");
  const decisionPoints = graph.nodes.filter((node) => (outgoing.get(node.id) ?? 0) >= 2);
  const structuralPass = graph.nodes.length === fixture.targetNodes && graph.nodes.filter((node) => node.kind === "ending").length === fixture.targetEndings && graph.nodes.filter((node) => node.kind === "start").length === 1 && contents.length === graph.nodes.length;
  const choiceContractPass = decisionPoints.length >= fixture.minimumDecisionPoints && graph.nodes.filter((node) => node.kind !== "ending").every((node) => (outgoing.get(node.id) ?? 0) > 0);
  const endingContractPass = endings.every((ending) => (outgoing.get(ending.id) ?? 0) === 0) && endings.length === fixture.targetEndings;
  const text = textFromCandidate(graph, contents);
  const languageMatch = chineseRatio(text) >= 0.5 && fixture.requiredTerms.every((term) => text.includes(term));
  if (!structuralPass) issueCodes.push("STRUCTURE");
  if (!choiceContractPass) issueCodes.push("CHOICE_CONTRACT");
  if (!endingContractPass) issueCodes.push("ENDING_CONTRACT");
  if (!languageMatch) issueCodes.push("LANGUAGE_OR_TERMS");
  if (candidate.data.outcome !== fixture.expectedOutcome) issueCodes.push("UNEXPECTED_OUTCOME");
  return EvaluationResultSchema.parse({
    schema: "storyforge-evaluation@1",
    policyVersion: "generation-evaluation@1",
    fixtureId: fixture.id,
    passed: structuralPass && choiceContractPass && endingContractPass && languageMatch && candidate.data.outcome === fixture.expectedOutcome && issueCodes.length === 0,
    structuralPass,
    choiceContractPass,
    endingContractPass,
    languageMatch,
    schemaFailure: false,
    expectedOutcomeObserved: candidate.data.outcome === fixture.expectedOutcome,
    retryCount: candidate.data.retryCount,
    latencyMs: candidate.data.latencyMs,
    issueCodes: [...new Set(issueCodes)],
  });
}

export function buildFakeEvaluationCandidate(fixtureInput: unknown): EvaluationCandidate {
  const fixture = EvaluationFixtureSchema.parse(fixtureInput);
  const sceneCount = fixture.targetNodes - fixture.targetEndings - 1;
  const termSeed = fixture.requiredTerms.join("、");
  const chapter = { id: "chapter-1", title: fixture.title, goal: "完成一次有限选择", summary: "围绕" + termSeed + "收束故事。" };
  const nodes: GraphOutput["nodes"] = [{ id: "start", chapterId: chapter.id, kind: "start", title: "开始", objective: "建立选择", summary: "故事从" + termSeed + "开始。", topologicalRank: 0 }];
  for (let index = 1; index <= sceneCount; index += 1) nodes.push({ id: "scene-" + index, chapterId: chapter.id, kind: "scene" as const, title: "场景" + index, objective: "推进" + termSeed, summary: "第" + index + "段围绕" + termSeed + "推进。", topologicalRank: index });
  for (let index = 1; index <= fixture.targetEndings; index += 1) nodes.push({ id: "ending-" + index, chapterId: chapter.id, kind: "ending" as const, title: "结局" + index, objective: "完成选择", summary: "选择带来" + termSeed + "的结局。", topologicalRank: sceneCount + index });
  const edges = [
    { id: "edge-start-main", sourceNodeId: "start", targetNodeId: "scene-1", label: "进入主线", intent: "推进" + termSeed, consequenceSummary: "主线继续", branchType: "main" as const, sortOrder: 0 },
    { id: "edge-start-side", sourceNodeId: "start", targetNodeId: "scene-2", label: "调查支线", intent: "调查" + termSeed, consequenceSummary: "支线汇合", branchType: "side" as const, sortOrder: 1 },
    { id: "edge-merge", sourceNodeId: "scene-2", targetNodeId: "scene-3", label: "回到现场", intent: "汇合" + termSeed, consequenceSummary: "回到主线", branchType: "side" as const, sortOrder: 0 },
  ];
  for (let index = 1; index < sceneCount; index += 1) edges.push({ id: "edge-" + index, sourceNodeId: "scene-" + index, targetNodeId: "scene-" + (index + 1), label: "继续" + index, intent: "推进" + termSeed, consequenceSummary: "继续前进", branchType: "main", sortOrder: 0 });
  const finalScene = "scene-" + sceneCount;
  for (let index = 1; index <= fixture.targetEndings; index += 1) edges.push({ id: "edge-ending-" + index, sourceNodeId: finalScene, targetNodeId: "ending-" + index, label: "选择结局" + index, intent: "完成" + termSeed, consequenceSummary: "抵达结局", branchType: index === 1 ? "main" : "side", sortOrder: index - 1 });
  const nodeContents = nodes.map((node) => ({ nodeId: node.id, body: node.title + "中，人物围绕" + termSeed + "作出选择并承担后果。", summary: node.summary, objective: node.objective }));
  return { graph: { chapters: [chapter], nodes, edges }, nodeContents, outcome: "completed", retryCount: 0, latencyMs: 0 };
}
