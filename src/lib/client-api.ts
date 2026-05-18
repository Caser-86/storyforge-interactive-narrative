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

export async function apiFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    ownerToken?: string | null;
    fingerprint?: string | null;
    body?: unknown;
  } = {}
): Promise<{ data: T; ok: true } | { data: ApiError; ok: false; status: number }> {
  const { method = "GET", ownerToken, fingerprint, body } = options;

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

  if (isJson) {
    const data = await res.json();
    return { data: data as T, ok: true };
  }

  return { data: null as T, ok: true };
}
