import { z } from "zod";
import { buildNodeContext } from "../context";
import type { GenerationProvider, ProviderResult } from "../provider";
import { ProviderError } from "../provider-errors";
import type { GenerationProjectContext } from "../prompts";
import { STAGE_SYSTEM_PROMPT } from "../prompts";
import type { GraphOutput } from "./types";

export const NodeContentOutputSchema = z
  .object({
    nodeId: z.string().min(1),
    body: z.string().min(1),
    summary: z.string().min(1),
    objective: z.string().min(1),
  })
  .strict();

export type NodeContentOutput = z.infer<typeof NodeContentOutputSchema>;

export interface NodeBatchInput {
  provider: GenerationProvider;
  graph: GraphOutput;
  context?: GenerationProjectContext;
  nodeIds?: string[];
}

export interface NodeBatchResult {
  outputs: NodeContentOutput[];
  providerResults: ProviderResult<NodeContentOutput>[];
}

export async function executeNodeBatch(input: NodeBatchInput, maxBatch = 2): Promise<NodeBatchResult> {
  const boundedBatch = Math.min(2, Math.max(1, Math.trunc(maxBatch)));
  const nodes = [...input.graph.nodes]
    .filter((node) => input.nodeIds === undefined || input.nodeIds.includes(node.id))
    .sort((left, right) => left.topologicalRank - right.topologicalRank || left.id.localeCompare(right.id))
    .slice(0, boundedBatch);
  const outputs: NodeContentOutput[] = [];
  const providerResults: ProviderResult<NodeContentOutput>[] = [];

  for (const node of nodes) {
    const nodeContext = buildNodeContext(input.graph, node.id);
    const providerResult = await input.provider.generate({
      stage: "nodes",
      stepKey: `nodes:${node.id}`,
      systemPrompt: STAGE_SYSTEM_PROMPT,
      userPrompt: `Write only the final content for this node. Keep all canon and branch facts consistent. Context: ${JSON.stringify(nodeContext)}`,
      outputSchema: NodeContentOutputSchema,
      model: input.context?.model,
    });
    if (providerResult.data.nodeId !== node.id) {
      throw new ProviderError("SCHEMA", `Node provider returned ${providerResult.data.nodeId} for ${node.id}`, false);
    }

    outputs.push(providerResult.data);
    providerResults.push(providerResult);
  }

  return { outputs, providerResults };
}
