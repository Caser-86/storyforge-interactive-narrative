import { z } from "zod";
import { readIntEnv } from "../../env";
import { AuthoringError } from "../errors";
import type { ProjectSize } from "../schemas";
import { STAGE_MAX_TOKENS } from "./prompts";

const MAX_RETRY_ATTEMPTS = 3;
const CONFIRMATION_CALL_THRESHOLD = 60;
const CONFIRMATION_OUTPUT_THRESHOLD = 150_000;
const DEFAULT_OUTPUT_PRICE_ENV = "STORYFORGE_OUTPUT_PRICE_PER_MILLION";

export const DEFAULT_GENERATION_MODEL = "deepseek-v4-flash";

export const GenerationBudgetSchema = z
  .object({
    policyVersion: z.enum(["generation-budget@1", "legacy"]),
    providerCallCount: z.number().int().min(0),
    maxOutputTokens: z.number().int().min(0),
    hardCapOutputTokens: z.number().int().positive().nullable(),
    estimatedOutputCost: z.number().finite().min(0).nullable(),
    requiresConfirmation: z.boolean(),
  })
  .strict();

export type GenerationBudget = z.infer<typeof GenerationBudgetSchema>;

export const LEGACY_GENERATION_BUDGET: GenerationBudget = {
  policyVersion: "legacy",
  providerCallCount: 0,
  maxOutputTokens: 0,
  hardCapOutputTokens: null,
  estimatedOutputCost: null,
  requiresConfirmation: false,
};

export interface GenerationBudgetOptions {
  hardCapOutputTokens?: number | null;
  outputPricePerMillion?: number | null;
}

function configuredHardCap(options: GenerationBudgetOptions): number | null {
  if (options.hardCapOutputTokens !== undefined) {
    return options.hardCapOutputTokens;
  }

  const cap = readIntEnv("STORYFORGE_MAX_OUTPUT_TOKENS", 0, { min: 1, max: 2_000_000 });
  return cap > 0 ? cap : null;
}

function configuredOutputPrice(options: GenerationBudgetOptions): number | null {
  if (options.outputPricePerMillion !== undefined) {
    return options.outputPricePerMillion !== null && Number.isFinite(options.outputPricePerMillion) && options.outputPricePerMillion >= 0
      ? options.outputPricePerMillion
      : null;
  }

  const raw = process.env[DEFAULT_OUTPUT_PRICE_ENV]?.trim();
  if (!raw) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function calculateGenerationBudget(size: ProjectSize, options: GenerationBudgetOptions = {}): GenerationBudget {
  const providerCallCount = (size.targetNodes + 5) * MAX_RETRY_ATTEMPTS;
  const perAttemptOutputTokens = STAGE_MAX_TOKENS.brief
    + STAGE_MAX_TOKENS.bible
    + STAGE_MAX_TOKENS.outline
    + STAGE_MAX_TOKENS.graph
    + (size.targetNodes * STAGE_MAX_TOKENS.nodes)
    + STAGE_MAX_TOKENS.continuity_review;
  const maxOutputTokens = perAttemptOutputTokens * MAX_RETRY_ATTEMPTS;
  const hardCapOutputTokens = configuredHardCap(options);
  const outputPricePerMillion = configuredOutputPrice(options);
  const estimatedOutputCost = outputPricePerMillion === null ? null : (maxOutputTokens / 1_000_000) * outputPricePerMillion;

  return {
    policyVersion: "generation-budget@1",
    providerCallCount,
    maxOutputTokens,
    hardCapOutputTokens,
    estimatedOutputCost,
    requiresConfirmation: providerCallCount > CONFIRMATION_CALL_THRESHOLD
      || maxOutputTokens > CONFIRMATION_OUTPUT_THRESHOLD
      || (hardCapOutputTokens !== null && hardCapOutputTokens < maxOutputTokens),
  };
}

export function resolveGenerationModel(requestedModel?: string | null): string {
  const configuredModel = process.env.OPENAI_MODEL?.trim() || DEFAULT_GENERATION_MODEL;
  const requested = requestedModel?.trim();
  if (requested && requested !== configuredModel) {
    throw new AuthoringError("VALIDATION", "Generation model must match the configured OPENAI_MODEL.", {
      configuredModel,
      requestedModel: requested,
    });
  }

  return configuredModel;
}
