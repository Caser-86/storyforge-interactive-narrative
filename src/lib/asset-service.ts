import { createHash } from "crypto";
import type { ArtPrompt } from "./schemas";
import { isCircuitOpen, recordFailure, recordSuccess, isWithinBudget } from "./observability-persist";

export type GenerateImageInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16";
  seed?: number;
  styleLock?: string;
  quality: "draft" | "standard" | "high";
};

export type GenerateImageResult = {
  provider: string;
  remoteId: string;
  imageUrl?: string;
  base64?: string;
  revisedPrompt?: string;
  latencyMs: number;
};

export function computePromptHash(artPrompt: ArtPrompt): string {
  const raw = `${artPrompt.prompt}|${artPrompt.styleLock}|${artPrompt.aspectRatio}`;
  return "sha256:" + createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function generateImageMock(input: GenerateImageInput): Promise<GenerateImageResult> {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 500));
  return {
    provider: "mock",
    remoteId: `mock_${Date.now()}`,
    imageUrl: `/api/placeholder?text=${encodeURIComponent(input.prompt.slice(0, 40))}`,
    latencyMs: Date.now() - start,
  };
}

export async function generateImageBfl(input: GenerateImageInput): Promise<GenerateImageResult> {
  const apiKey = process.env.BFL_API_KEY;
  if (!apiKey) {
    throw new Error("BFL_API_KEY not configured");
  }

  const model = input.quality === "high"
    ? (process.env.BFL_HD_MODEL || "flux-2-pro")
    : (process.env.BFL_DEFAULT_MODEL || "flux-2-klein");
  const start = Date.now();
  const BFL_TIMEOUT_MS = parseInt(process.env.BFL_TIMEOUT_MS || "120000", 10);

  const qualityScale: Record<string, number> = {
    draft: 0.5,
    standard: 1,
    high: 1.5,
  };
  const scale = qualityScale[input.quality] || 1;

  const widthHeight: Record<string, [number, number]> = {
    "1:1": [1024, 1024],
    "4:3": [1024, 768],
    "16:9": [1024, 576],
    "9:16": [576, 1024],
  };

  const [baseW, baseH] = widthHeight[input.aspectRatio] || [1024, 1024];
  const width = Math.round(baseW * scale);
  const height = Math.round(baseH * scale);

  const createController = new AbortController();
  const createTimeout = setTimeout(() => createController.abort(), 30000);

  let createRes: Response;
  try {
    createRes = await fetch("https://api.bfl.ai/v1/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Key": apiKey,
      },
      body: JSON.stringify({
        prompt: input.prompt,
        negative_prompt: input.negativePrompt || "",
        width,
        height,
        seed: input.seed,
        model,
      }),
      signal: createController.signal,
    });
  } finally {
    clearTimeout(createTimeout);
  }

  if (!createRes.ok) {
    throw new Error(`BFL create failed: ${createRes.status}`);
  }

  const createData = await createRes.json();
  const pollingUrl = createData.polling_url;
  const deadline = Date.now() + BFL_TIMEOUT_MS;

  for (let i = 0; i < 120; i++) {
    if (Date.now() > deadline) {
      throw new Error(`BFL generation timed out after ${BFL_TIMEOUT_MS / 1000}s`);
    }
    await new Promise((r) => setTimeout(r, 1000));
    const pollRes = await fetch(pollingUrl);
    const pollData = await pollRes.json();

    if (pollData.status === "Ready" && pollData.result?.sample) {
      recordSuccess("bfl");
      return {
        provider: `bfl_${model}`,
        remoteId: createData.id || pollingUrl,
        imageUrl: pollData.result.sample,
        latencyMs: Date.now() - start,
      };
    }

    if (pollData.status === "Failed") {
      throw new Error(`BFL generation failed: ${JSON.stringify(pollData)}`);
    }
  }

  throw new Error("BFL generation timed out after 120s");
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const provider = process.env.IMAGE_PROVIDER || "mock";

  if (!isWithinBudget()) {
    throw new Error("BUDGET_EXCEEDED: daily token/asset limit reached");
  }

  if (provider === "mock") {
    return generateImageMock(input);
  }

  if (isCircuitOpen(provider)) {
    console.warn(`[AssetService] ${provider} circuit is OPEN, falling back to mock`);
    const fallback = await generateImageMock(input);
    return { ...fallback, provider: `${provider}->mock_circuit_open` };
  }

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      switch (provider) {
        case "bfl":
          return await generateImageBfl(input);
        default:
          return generateImageMock(input);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      recordFailure(provider);
      console.warn(`[AssetService] ${provider} attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  console.warn(`[AssetService] ${provider} failed after ${maxRetries} attempts, falling back to mock`);
  const fallback = await generateImageMock(input);
  return { ...fallback, provider: `${provider}->mock_fallback` };
}
