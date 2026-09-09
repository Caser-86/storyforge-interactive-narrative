import { classifyProviderError } from "@/lib/authoring/generation/provider-errors";

const RETRYABLE_CODES = new Set(["TIMEOUT", "NETWORK", "RATE_LIMIT"]);
export const INTERACTIVE_GENERATION_MAX_ATTEMPTS = 3;

export interface InteractiveRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  signal?: AbortSignal;
  retrySchemaFailures?: boolean;
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Generation canceled", "AbortError"));
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Generation canceled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function generateWithInteractiveRetry<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  options: InteractiveRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? INTERACTIVE_GENERATION_MAX_ATTEMPTS));
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 1_000));
  const retryableCodes = new Set(RETRYABLE_CODES);
  if (options.retrySchemaFailures) retryableCodes.add("SCHEMA");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (options.signal?.aborted) throw new DOMException("Generation canceled", "AbortError");
      return await operation(options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const providerError = classifyProviderError(error);
      const canRetry = attempt < maxAttempts && retryableCodes.has(providerError.code);
      if (!canRetry) throw error;
      await wait(delayMs * attempt, options.signal);
    }
  }

  throw new Error("Interactive generation retry loop exhausted unexpectedly.");
}
