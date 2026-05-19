import { CreateGameResponseSchema, ChoiceResponseSchema, GetSessionResponseSchema } from "@/lib/api-contracts";

export function authHeaders(ownerToken?: string | null, fingerprint?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (ownerToken) headers["x-owner-token"] = ownerToken;
  if (fingerprint) headers["x-user-fingerprint"] = fingerprint;
  return headers;
}

export interface ApiError {
  code: string;
  message: string;
  traceId: string;
}

export type ApiResult<T> =
  | { data: T; ok: true }
  | { data: ApiError; ok: false; status: number };

interface ZodLikeSchema {
  safeParse: (d: unknown) => { success: boolean; error?: { message: string } };
}

export async function apiFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    ownerToken?: string | null;
    fingerprint?: string | null;
    body?: unknown;
    responseType?: "json" | "blob";
    responseSchema?: ZodLikeSchema;
  } = {}
): Promise<ApiResult<T>> {
  const { method = "GET", ownerToken, fingerprint, body, responseType = "json", responseSchema } = options;

  const headers: Record<string, string> = {
    ...authHeaders(ownerToken, fingerprint),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const err = await res.json();
      return { data: err as ApiError, ok: false, status: res.status };
    }
    return {
      data: { code: "UNKNOWN", message: `HTTP ${res.status}`, traceId: "" },
      ok: false,
      status: res.status,
    };
  }

  if (responseType === "blob") {
    const blob = await res.blob();
    return { data: blob as T, ok: true };
  }

  if (isJson) {
    const data = await res.json();
    if (responseSchema && process.env.NODE_ENV === "development") {
      const result = responseSchema.safeParse(data);
      if (!result.success) {
        console.error(`[API Contract] ${path} response schema mismatch:`, result.error?.message);
      }
    }
    return { data: data as T, ok: true };
  }

  return { data: null as T, ok: true };
}

export function throwApiError<T>(result: ApiResult<T>): T {
  if (result.ok) return result.data;
  const { data, status } = result;
  const error = new Error(data.message || `HTTP ${status}`);
  (error as Error & { traceId?: string }).traceId = data.traceId;
  throw error;
}

export function formatApiError(result: { data: ApiError; ok: false; status: number }): string {
  const { data, status } = result;
  return `${data.message || `HTTP ${status}`}${data.traceId ? ` (trace: ${data.traceId})` : ""}`;
}

export const Schemas = {
  CreateGame: CreateGameResponseSchema,
  Choice: ChoiceResponseSchema,
  GetSession: GetSessionResponseSchema,
} as const;
