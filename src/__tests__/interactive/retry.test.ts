import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import { generateWithInteractiveRetry } from "@/lib/interactive/retry";

describe("interactive generation retry", () => {
  it("retries a transient timeout and returns the later result", async () => {
    let attempts = 0;

    await expect(generateWithInteractiveRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new ProviderError("TIMEOUT", "Request timed out.", true);
      return "scene";
    }, { delayMs: 0 })).resolves.toBe("scene");

    expect(attempts).toBe(2);
  });

  it("stops after the bounded number of transient attempts", async () => {
    let attempts = 0;
    const error = new ProviderError("NETWORK", "socket reset", true);

    await expect(generateWithInteractiveRetry(async () => {
      attempts += 1;
      throw error;
    }, { maxAttempts: 3, delayMs: 0 })).rejects.toBe(error);

    expect(attempts).toBe(3);
  });

  it("retries a post-provider schema validation failure when enabled", async () => {
    let attempts = 0;

    await expect(generateWithInteractiveRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new z.ZodError([]);
      return "scene";
    }, { delayMs: 0, retrySchemaFailures: true })).resolves.toBe("scene");

    expect(attempts).toBe(2);
  });

  it("does not retry non-transient schema failures", async () => {
    let attempts = 0;

    await expect(generateWithInteractiveRetry(async () => {
      attempts += 1;
      throw new ProviderError("SCHEMA", "invalid scene", false);
    }, { delayMs: 0 })).rejects.toMatchObject({ code: "SCHEMA" });

    expect(attempts).toBe(1);
  });

  it("retries a schema drift from the live model and returns a valid scene", async () => {
    let attempts = 0;

    await expect(generateWithInteractiveRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new ProviderError("SCHEMA", "invalid scene", false);
      return "scene";
    }, { delayMs: 0, retrySchemaFailures: true })).resolves.toBe("scene");

    expect(attempts).toBe(2);
  });
});
