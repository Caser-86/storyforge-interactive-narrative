import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import type { GenerationProvider, ProviderResult, StructuredGenerationRequest } from "@/lib/authoring/generation/provider";

function readProgress(prompt: string): { turn: number; targetTurns: number } {
  const match = prompt.match(/turn\s+(\d+)\/(\d+)/i);
  return {
    turn: match ? Number(match[1]) : 1,
    targetTurns: match ? Number(match[2]) : 8,
  };
}

export class FakeInteractiveGenerationProvider implements GenerationProvider {
  public async generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
    const { turn, targetTurns } = readProgress(request.userPrompt);
    const isEnding = turn >= targetTurns;
    const value = {
      scene: isEnding
        ? {
            title: `第 ${turn} 幕`,
            body: "你把一路收集的线索放回桌面，门后的真相终于有了完整的形状。",
            summary: "所有线索在最后一步汇合。",
            choices: [],
            isEnding: true,
            endingSummary: "本次互动已经收束。",
          }
        : {
            title: `第 ${turn} 幕`,
            body: "门后的记录改变了调查方向，你必须决定下一步如何行动。",
            summary: "新的线索把故事推向下一幕。",
            choices: [
              { id: "choice_a", label: "继续调查", intent: "沿当前线索深入调查", risk: "medium" as const, consequencePreview: "你会更接近核心真相。" },
              { id: "choice_b", label: "改道前进", intent: "寻找另一条安全路线", risk: "low" as const, consequencePreview: "你会避开眼前的风险。" },
              { id: "choice_c", label: "暂缓行动", intent: "观察局势等待变化", risk: "high" as const, consequencePreview: "你可能失去主动权。" },
            ],
            isEnding: false,
            endingSummary: null,
          },
      statePatch: {
        knownFacts: [`已推进到第 ${turn} 幕`],
        openThreads: isEnding ? [] : ["门后的真相"],
        resolvedThreads: isEnding ? ["门后的真相"] : [],
        lastChoiceImpact: "调查方向发生了变化。",
        endingReadiness: isEnding ? 100 : Math.min(90, turn * 10),
      },
    };
    const parsed = request.outputSchema.safeParse(value);
    if (!parsed.success) {
      throw new ProviderError("SCHEMA", "Fake interactive fixture failed the output schema", false, { details: parsed.error.flatten() });
    }

    return {
      data: parsed.data as T,
      rawResponse: JSON.stringify({ fake: true, value }),
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: request.model ?? "fake-interactive",
    };
  }
}
