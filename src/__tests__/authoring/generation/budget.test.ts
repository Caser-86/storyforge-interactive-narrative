import { afterEach, describe, expect, it } from "vitest";
import {
  calculateGenerationBudget,
  DEFAULT_GENERATION_MODEL,
  resolveGenerationModel,
} from "@/lib/authoring/generation/budget";

const originalModel = process.env.OPENAI_MODEL;

afterEach(() => {
  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

describe("generation budget", () => {
  it("calculates a bounded request and output envelope from the node target", () => {
    const budget = calculateGenerationBudget({
      preset: "micro",
      targetNodes: 8,
      targetEndings: 2,
    });

    expect(budget).toMatchObject({
      policyVersion: "generation-budget@1",
      providerCallCount: 39,
      maxOutputTokens: 134_400,
      hardCapOutputTokens: null,
      requiresConfirmation: false,
    });
  });

  it("marks a run when the configured hard cap can pause it", () => {
    const budget = calculateGenerationBudget(
      { preset: "short", targetNodes: 24, targetEndings: 4 },
      { hardCapOutputTokens: 100_000, outputPricePerMillion: 2 },
    );

    expect(budget.providerCallCount).toBe(87);
    expect(budget.maxOutputTokens).toBeGreaterThan(budget.hardCapOutputTokens!);
    expect(budget.estimatedOutputCost).toBeGreaterThan(0);
    expect(budget.requiresConfirmation).toBe(true);
  });

  it("uses the configured model and rejects an arbitrary request override", () => {
    process.env.OPENAI_MODEL = "deepseek-v4-flash";

    expect(resolveGenerationModel()).toBe("deepseek-v4-flash");
    expect(resolveGenerationModel("deepseek-v4-flash")).toBe("deepseek-v4-flash");
    expect(() => resolveGenerationModel("another-provider-model")).toThrow(/OPENAI_MODEL/);
  });

  it("falls back to the supported model when no model is configured", () => {
    delete process.env.OPENAI_MODEL;

    expect(resolveGenerationModel()).toBe(DEFAULT_GENERATION_MODEL);
  });
});
