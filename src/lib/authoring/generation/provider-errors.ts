import { ZodError } from "zod";

export type ProviderErrorCode = "AUTH" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK" | "EMPTY" | "SCHEMA" | "UNKNOWN";

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly details?: unknown;

  constructor(
    code: ProviderErrorCode,
    message: string,
    retryable: boolean,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
    this.status = options.status;
    this.details = options.details;
  }
}

type ErrorLike = {
  status?: number;
  response?: { status?: number };
  code?: string;
  name?: string;
  message?: string;
};

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : {};
}

export function classifyProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ProviderError("SCHEMA", "Provider response failed schema validation", false, {
      details: { issueCount: error.issues.length },
      cause: error,
    });
  }

  const source = asErrorLike(error);
  const status = source.status ?? source.response?.status;
  const code = source.code?.toUpperCase();
  const name = source.name?.toUpperCase();
  const message = source.message ?? String(error);

  if (status === 401 || status === 403) {
    return new ProviderError("AUTH", message, false, { status, cause: error });
  }

  if (status === 429) {
    return new ProviderError("RATE_LIMIT", message, true, { status, cause: error });
  }

  if (
    status === 408
    || name === "TIMEOUT"
    || code === "ETIMEDOUT"
    || code === "ABORT_ERR"
    || /timed?\s*out|timeout|deadline\s+exceeded/i.test(message)
  ) {
    return new ProviderError("TIMEOUT", message, true, { status, cause: error });
  }

  if (
    (status !== undefined && status >= 500) ||
    ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(code ?? "")
  ) {
    return new ProviderError("NETWORK", message, true, { status, cause: error });
  }

  return new ProviderError("UNKNOWN", message, false, { status, cause: error });
}
