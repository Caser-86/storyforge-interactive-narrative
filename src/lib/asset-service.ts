import { createHash } from "crypto";
import type { ArtPrompt } from "./schemas";

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
  const raw = `${artPrompt.prompt}|${artPrompt.styleLock}|${artPrompt.aspectRatio}|${artPrompt.seedHint}`;
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

  const model = process.env.BFL_DEFAULT_MODEL || "flux-2-klein";
  const start = Date.now();

  const widthHeight: Record<string, [number, number]> = {
    "1:1": [1024, 1024],
    "4:3": [1024, 768],
    "16:9": [1024, 576],
    "9:16": [576, 1024],
  };

  const [width, height] = widthHeight[input.aspectRatio] || [1024, 1024];

  const createRes = await fetch("https://api.bfl.ai/v1/image", {
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
  });

  if (!createRes.ok) {
    throw new Error(`BFL create failed: ${createRes.status}`);
  }

  const createData = await createRes.json();
  const pollingUrl = createData.polling_url;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const pollRes = await fetch(pollingUrl);
    const pollData = await pollRes.json();

    if (pollData.status === "Ready" && pollData.result?.sample) {
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

  throw new Error("BFL generation timed out after 60s");
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const provider = process.env.IMAGE_PROVIDER || "mock";

  switch (provider) {
    case "bfl":
      return generateImageBfl(input);
    case "mock":
    default:
      return generateImageMock(input);
  }
}
