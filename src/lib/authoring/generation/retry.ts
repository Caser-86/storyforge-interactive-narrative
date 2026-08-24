import { classifyProviderError, type ProviderError } from "./provider-errors";

const RETRY_DELAYS_MS = [15_000, 60_000, 300_000] as const;

export interface RetryDecision {
  error: ProviderError;
  retryable: boolean;
  nextAttemptAt: Date | null;
}

export function retryDecision(error: unknown, attempt: number, now: Date): RetryDecision {
  const providerError = classifyProviderError(error);
  const canRetry = providerError.retryable && ["RATE_LIMIT", "TIMEOUT", "NETWORK"].includes(providerError.code) && attempt < RETRY_DELAYS_MS.length;

  return {
    error: providerError,
    retryable: canRetry,
    nextAttemptAt: canRetry ? new Date(now.getTime() + RETRY_DELAYS_MS[Math.max(0, attempt - 1)]!) : null,
  };
}
