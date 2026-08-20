import OpenAI from "openai";
import { readIntEnv } from "../../env";
import type { GenerationProvider, ProviderResult, StructuredGenerationRequest } from "./provider";
import { classifyProviderError, ProviderError } from "./provider-errors";

interface ChatCompletionClient {
  chat: {
    completions: {
      create(request: {
        model: string;
        messages: Array<{ role: "system" | "user"; content: string }>;
        response_format: { type: "json_object" };
        temperature?: number;
        max_tokens?: number;
      }): Promise<unknown>;
    };
  };
}

export interface OpenAICompatibleProviderOptions {
  client?: ChatCompletionClient;
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  defaultModel?: string;
}

type ChatCompletionResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class OpenAICompatibleGenerationProvider implements GenerationProvider {
  private readonly options: OpenAICompatibleProviderOptions;
  private client: ChatCompletionClient | null;

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.options = options;
    this.client = options.client ?? null;
  }

  public async generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
    const start = Date.now();
    const model = request.model ?? this.options.defaultModel ?? process.env.OPENAI_MODEL ?? "deepseek-v4-flash";

    try {
      const response = (await this.getClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      })) as ChatCompletionResponse;
      const rawResponse = JSON.stringify(response) ?? String(response);
      const content = response.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new ProviderError("EMPTY", "Provider returned no structured content", true, { details: response });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new ProviderError("SCHEMA", "Provider returned invalid JSON", false, { cause: error });
      }

      const validated = request.outputSchema.safeParse(parsed);
      if (!validated.success) {
        throw new ProviderError("SCHEMA", "Provider response failed the output schema", false, {
          details: validated.error.flatten(),
        });
      }

      return {
        data: validated.data,
        rawResponse,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - start,
        model,
        requestId: response.id,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      throw classifyProviderError(error);
    }
  }

  private getClient(): ChatCompletionClient {
    if (!this.client) {
      const client = new OpenAI({
        apiKey: this.options.apiKey ?? process.env.OPENAI_API_KEY,
        baseURL: this.options.baseURL ?? process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com",
        timeout: this.options.timeoutMs ?? readIntEnv("OPENAI_TIMEOUT_MS", 60_000, { min: 1 }),
        maxRetries: 0,
      });
      this.client = client as unknown as ChatCompletionClient;
    }

    return this.client;
  }
}
