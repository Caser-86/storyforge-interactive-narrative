import type { ZodType } from "zod";
import type { GenerationStage } from "./schemas";

export interface StructuredGenerationRequest<T> {
  stage: Exclude<GenerationStage, "ready">;
  stepKey: string;
  systemPrompt: string;
  userPrompt: string;
  outputSchema: ZodType<T>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderResult<T> {
  data: T;
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  requestId?: string;
}

export interface GenerationProvider {
  generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>>;
}
