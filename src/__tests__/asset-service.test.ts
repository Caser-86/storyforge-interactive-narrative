import { describe, it, expect } from "vitest";
import { computePromptHash } from "@/lib/asset-service";

describe("computePromptHash", () => {
  it("produces consistent hashes for same input", () => {
    const prompt = {
      prompt: "a dark forest",
      negativePrompt: "text",
      styleLock: "dark fantasy",
      aspectRatio: "16:9" as const,
      seedHint: 12345,
    };
    const hash1 = computePromptHash(prompt);
    const hash2 = computePromptHash(prompt);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different prompts", () => {
    const prompt1 = {
      prompt: "a dark forest",
      negativePrompt: "text",
      styleLock: "dark fantasy",
      aspectRatio: "16:9" as const,
      seedHint: 12345,
    };
    const prompt2 = {
      ...prompt1,
      prompt: "a bright meadow",
    };
    const hash1 = computePromptHash(prompt1);
    const hash2 = computePromptHash(prompt2);
    expect(hash1).not.toBe(hash2);
  });

  it("ignores seedHint in hash computation", () => {
    const prompt1 = {
      prompt: "a dark forest",
      negativePrompt: "text",
      styleLock: "dark fantasy",
      aspectRatio: "16:9" as const,
      seedHint: 12345,
    };
    const prompt2 = {
      ...prompt1,
      seedHint: 99999,
    };
    const hash1 = computePromptHash(prompt1);
    const hash2 = computePromptHash(prompt2);
    expect(hash1).toBe(hash2);
  });
});
