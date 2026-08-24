import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildBriefPrompt, STAGE_MAX_TOKENS, STAGE_SYSTEM_PROMPT } from "../lib/authoring/generation/prompts";
import { OpenAICompatibleGenerationProvider } from "../lib/authoring/generation/openai-provider";
import { buildSmokeReport } from "../lib/authoring/generation/smoke";
import { BriefOutputSchema } from "../lib/authoring/generation/stages/types";
import { loadAuthoringEnv } from "../lib/authoring/local-env";
import { getErrorMessage } from "../lib/errors";

loadAuthoringEnv();
const args = new Set(process.argv.slice(2));
const model = process.env.OPENAI_MODEL || "deepseek-v4-flash";

function smokeContext() {
  return {
    projectId: "manual-llm-smoke",
    versionId: "manual-llm-smoke",
    title: "第九档案室",
    premise: "一名档案员在封存的档案室中发现一扇不该存在的门。",
    genre: "悬疑",
    tone: "克制紧张",
    pointOfView: "第二人称",
    rating: "PG-13",
    language: "Chinese",
    size: { preset: "micro" as const, targetNodes: 8, targetEndings: 2 },
    model,
  };
}

async function smoke(): Promise<void> {
  if (args.has("--dry-run")) {
    console.log(JSON.stringify({ status: "dry-run", model, networkRequest: false }));
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for the manual LLM smoke test.");
  }

  const provider = new OpenAICompatibleGenerationProvider();
  const context = smokeContext();
  const result = await provider.generate({
    stage: "brief",
    stepKey: "brief:manual-smoke",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: buildBriefPrompt(context),
    outputSchema: BriefOutputSchema,
    model,
    maxTokens: STAGE_MAX_TOKENS.brief,
  });

  console.log(JSON.stringify(buildSmokeReport({
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
  })));
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  smoke().catch((error) => {
    console.error(getErrorMessage(error));
    process.exit(1);
  });
}
