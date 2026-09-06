import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import { OpenAICompatibleGenerationProvider } from "@/lib/authoring/generation/openai-provider";
import { classifyProviderError, ProviderError } from "@/lib/authoring/generation/provider-errors";

const OutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
});

const request = {
  stage: "brief" as const,
  stepKey: "brief:main",
  systemPrompt: "Return JSON.",
  userPrompt: "Create a brief.",
  outputSchema: OutputSchema,
  model: "deepseek-v4-flash",
};

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe("generation provider errors", () => {
  it.each([
    [401, "AUTH", false],
    [403, "AUTH", false],
    [429, "RATE_LIMIT", true],
    [500, "NETWORK", true],
    [503, "NETWORK", true],
  ] as const)("maps HTTP %s to %s", (status, code, retryable) => {
    expect(classifyProviderError(httpError(status))).toMatchObject({ code, retryable });
  });

  it("maps timeout and transport failures", () => {
    expect(classifyProviderError(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }))).toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    });
    expect(classifyProviderError(new Error("Request timed out."))).toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    });
    expect(classifyProviderError(Object.assign(new Error("socket reset"), { code: "ECONNRESET" }))).toMatchObject({
      code: "NETWORK",
      retryable: true,
    });
  });

  it("preserves an existing provider error", () => {
    const error = new ProviderError("AUTH", "invalid key", false);
    expect(classifyProviderError(error)).toBe(error);
  });
});

describe("fake generation provider", () => {
  it("returns validated fixtures and records calls", async () => {
    const provider = new FakeGenerationProvider();
    provider.reply("brief", "brief:main", { title: "The Orchard", summary: "A hidden route." });

    const result = await provider.generate(request);

    expect(result.data).toEqual({ title: "The Orchard", summary: "A hidden route." });
    expect(result.model).toBe("deepseek-v4-flash");
    expect(provider.callsFor("brief:main")).toHaveLength(1);
  });

  it("does not silently accept invalid fixtures", async () => {
    const provider = new FakeGenerationProvider();
    provider.reply("brief", "brief:main", { title: "Missing summary" });

    await expect(provider.generate(request)).rejects.toMatchObject({ code: "SCHEMA", retryable: false });
  });
});

describe("OpenAI-compatible generation provider", () => {
  it("parses structured JSON and preserves raw response and usage", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "chatcmpl-test",
      choices: [{ message: { content: JSON.stringify({ title: "The Orchard", summary: "A hidden route." }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
    const provider = new OpenAICompatibleGenerationProvider({
      client: { chat: { completions: { create } } },
    });

    const result = await provider.generate(request);

    expect(result.data.title).toBe("The Orchard");
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(8);
    expect(result.rawResponse).toContain("chatcmpl-test");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
    }));
  });

  it("disables extended thinking for Volcengine structured generation", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: "The Orchard", summary: "A hidden route." }) } }],
    });
    const provider = new OpenAICompatibleGenerationProvider({
      baseURL: "https://ark.cn-beijing.volces.com/api/plan/v3",
      client: { chat: { completions: { create } } },
    });

    await provider.generate({ ...request, model: "doubao-seed-evolving" });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "doubao-seed-evolving",
      thinking: { type: "disabled" },
    }));
  });

  it("accepts JSON wrapped in a markdown fence or short provider preamble", async () => {
    const provider = new OpenAICompatibleGenerationProvider({
      client: {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "Here is the JSON:\n```json\n{\"title\":\"The Orchard\",\"summary\":\"A hidden route.\"}\n```" } }],
            }),
          },
        },
      },
    });

    await expect(provider.generate(request)).resolves.toMatchObject({
      data: { title: "The Orchard", summary: "A hidden route." },
    });
  });

  it("maps empty and invalid structured responses", async () => {
    const empty = new OpenAICompatibleGenerationProvider({
      client: { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } } },
    });
    await expect(empty.generate(request)).rejects.toMatchObject({ code: "EMPTY", retryable: true });

    const invalid = new OpenAICompatibleGenerationProvider({
      client: {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"title":1}' } }] }),
          },
        },
      },
    });
    await expect(invalid.generate(request)).rejects.toMatchObject({ code: "SCHEMA", retryable: false });
  });
});
