import { DEFAULT_OPENAI_MODEL } from "./defaults";
import { ProviderError } from "./provider-errors";
import type { GenerationProvider, ProviderResult, StructuredGenerationRequest } from "./provider";

type FakeReply = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
};

export type FakeGenerationCall = {
  stage: StructuredGenerationRequest<unknown>["stage"];
  stepKey: string;
  model?: string;
  userPrompt: string;
};

function replyKey(stage: string, stepKey: string): string {
  return `${stage}:${stepKey}`;
}

export class FakeGenerationProvider implements GenerationProvider {
  private readonly replies = new Map<string, FakeReply>();
  private readonly calls: FakeGenerationCall[] = [];

  public reply(stage: string, stepKey: string, value: unknown, usage: { inputTokens?: number; outputTokens?: number } = {}): void {
    this.replies.set(replyKey(stage, stepKey), {
      value,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    });
  }

  public callsFor(stepKey: string): FakeGenerationCall[] {
    return this.calls.filter((call) => call.stepKey === stepKey);
  }

  public allCalls(): FakeGenerationCall[] {
    return [...this.calls];
  }

  public async generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
    this.calls.push({
      stage: request.stage,
      stepKey: request.stepKey,
      model: request.model,
      userPrompt: request.userPrompt,
    });

    const fixture = this.replies.get(replyKey(request.stage, request.stepKey));
    if (!fixture) {
      throw new ProviderError("UNKNOWN", `No fake provider fixture for ${request.stage}/${request.stepKey}`, false);
    }

    const validated = request.outputSchema.safeParse(fixture.value);
    if (!validated.success) {
      throw new ProviderError("SCHEMA", `Fake fixture failed the output schema for ${request.stepKey}`, false, {
        details: validated.error.flatten(),
      });
    }

    return {
      data: validated.data,
      rawResponse: JSON.stringify({ fake: true, stage: request.stage, stepKey: request.stepKey, value: fixture.value }),
      inputTokens: fixture.inputTokens,
      outputTokens: fixture.outputTokens,
      latencyMs: 0,
      model: request.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    };
  }
}
