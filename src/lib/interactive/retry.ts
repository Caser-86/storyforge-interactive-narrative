import { classifyProviderError } from "@/lib/authoring/generation/provider-errors";

const RETRYABLE_CODES = new Set(["TIMEOUT", "NETWORK", "RATE_LIMIT"]);
export const INTERACTIVE_GENERATION_MAX_ATTEMPTS = 3;

export interface InteractiveRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
}

function wait(delayMs: number): Promise<void> {
  return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
}

export async function generateWithInteractiveRetry<T>(
  operation: () => Promise<T>,
  options: InteractiveRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? INTERACTIVE_GENERATION_MAX_ATTEMPTS));
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 1_000));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const providerError = classifyProviderError(error);
      const canRetry = attempt < maxAttempts && RETRYABLE_CODES.has(providerError.code);
      if (!canRetry) throw error;
      await wait(delayMs * attempt);
    }
  }

  throw new Error("Interactive generation retry loop exhausted unexpectedly.");
}
