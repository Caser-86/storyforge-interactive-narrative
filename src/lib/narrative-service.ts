import OpenAI from "openai";
import { NarrativeOutputSchema, type NarrativeOutput } from "./schemas";
import { SYSTEM_PROMPT, buildUserPrompt, RETRY_PROMPT } from "./prompts";

const openai = new OpenAI();

interface GenerateSceneParams {
  seedPrompt: string;
  language: string;
  rating: string;
  storyState?: string;
  previousSceneSummary?: string;
  selectedChoice?: string;
}

export async function generateNarrative(params: GenerateSceneParams): Promise<{
  data: NarrativeOutput;
  latencyMs: number;
  retryCount: number;
}> {
  const userPrompt = buildUserPrompt(params);
  const maxRetries = 1;
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\n${RETRY_PROMPT}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.85,
      max_tokens: 3000,
    });

    const latencyMs = Date.now() - start;
    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("LLM returned empty content");
    }

    try {
      const parsed = JSON.parse(raw);
      const validated = NarrativeOutputSchema.parse(parsed);
      return { data: validated, latencyMs, retryCount };
    } catch (validationError) {
      retryCount++;
      if (attempt === maxRetries) {
        throw new Error(`Schema validation failed after ${maxRetries + 1} attempts: ${validationError}`);
      }
    }
  }

  throw new Error("Unreachable");
}
