import type { ZodType, ZodTypeDef } from "zod";
import type { GenerationStage } from "./schemas";

export interface StructuredGenerationRequest<T> {
  stage: Exclude<GenerationStage, "ready">;
  stepKey: string;
  systemPrompt: string;
  userPrompt: string;
  // Providers parse untrusted model JSON, so schemas may normalize a wider input shape into T.
  outputSchema: ZodType<T, ZodTypeDef, unknown>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ProviderResult<T> {
  data: T;
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  usageConfirmed?: boolean;
  latencyMs: number;
  model: string;
  requestId?: string;
}

export interface GenerationProvider {
  generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>>;
}
