import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import type { GenerationProvider, ProviderResult, StructuredGenerationRequest } from "@/lib/authoring/generation/provider";
import { evaluateInteractiveFixture, InteractiveEvaluationFixtureSchema } from "@/lib/interactive/evaluation";
import { FakeInteractiveGenerationProvider } from "@/lib/interactive/fake-provider";

const fixture = {
  id: "interactive-evaluation-6",
  title: "雾中的档案室",
  premise: "档案员在雾中找到一份被篡改的记录，必须逐幕决定如何核对真相。",
  genre: "悬疑",
  tone: "克制紧张",
  pointOfView: "第三人称",
  rating: "PG-13",
  language: "zh-CN" as const,
  sizePreset: "micro" as const,
  targetTurns: 6,
  riskSequence: ["low", "medium", "high", "low", "high"] as const,
};

describe("interactive evaluation", () => {
  it("walks every bounded turn and records the selected risk path before the ending", async () => {
    const result = await evaluateInteractiveFixture(fixture);

    expect(result).toMatchObject({
      fixtureId: fixture.id,
      passed: true,
      targetTurns: 6,
      generatedTurns: 6,
      activeSceneCount: 5,
      endingPass: true,
      choiceContractPass: true,
      riskCoveragePass: true,
      consequencePass: true,
    });
    expect(result.selectedRisks).toEqual(fixture.riskSequence);
    expect(result.issueCodes).toEqual([]);
  });

  it("retries a transient schema drift before failing the evaluated path", async () => {
    const fallback = new FakeInteractiveGenerationProvider();
    let attempts = 0;
    const provider: GenerationProvider = {
      async generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
        attempts += 1;
        if (attempts === 1) throw new ProviderError("SCHEMA", "transient schema drift", false);
        return fallback.generate(request) as Promise<ProviderResult<T>>;
      },
    };

    const result = await evaluateInteractiveFixture(fixture, provider);

    expect(result.passed).toBe(true);
    expect(attempts).toBe(fixture.targetTurns + 1);
  });

  it("preserves the provider error category when a bounded path fails", async () => {
    const provider: GenerationProvider = {
      async generate<T>(_request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
        throw new ProviderError("SCHEMA", "response did not match the schema", false);
      },
    };

    const result = await evaluateInteractiveFixture(fixture, provider);

    expect(result.passed).toBe(false);
    expect(result.issueCodes).toContain("GENERATION_SCHEMA");
    expect(result.issueCodes).not.toContain("GENERATION");
  });

  it("preserves a generation contract validation category when the model ends early", async () => {
    const provider: GenerationProvider = {
      async generate<T>(_request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
        return {
          data: {
            scene: {
              title: "提前结束",
              body: "冲突还没有解决。",
              summary: "模型提前结束了故事。",
              choices: [],
              isEnding: true,
              endingSummary: "暂时沉默。",
            },
            statePatch: {},
          } as T,
          rawResponse: "{}",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          model: "test-model",
        };
      },
    };

    const result = await evaluateInteractiveFixture(fixture, provider);

    expect(result.passed).toBe(false);
    expect(result.issueCodes).toContain("GENERATION_VALIDATION");
    expect(result.issueCodes).not.toContain("GENERATION_UNKNOWN");
  });

  it("rejects a fixture whose size preset does not produce its declared turn count", () => {
    expect(() => InteractiveEvaluationFixtureSchema.parse({ ...fixture, sizePreset: "short" })).toThrow(/targetTurns|sizePreset/);
  });
});
