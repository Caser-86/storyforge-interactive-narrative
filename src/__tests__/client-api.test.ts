import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { apiFetch, throwApiError, formatApiError, authHeaders } from "@/lib/client-api";

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)])),
  };
}

describe("client-api: authHeaders", () => {
  it("returns empty headers when no tokens provided", () => {
    expect(authHeaders()).toEqual({});
  });

  it("includes x-owner-token when provided", () => {
    expect(authHeaders("tok_123")).toEqual({ "x-owner-token": "tok_123" });
  });

  it("includes x-user-fingerprint when provided", () => {
    expect(authHeaders(null, "fp_abc")).toEqual({ "x-user-fingerprint": "fp_abc" });
  });

  it("includes both headers when both provided", () => {
    expect(authHeaders("tok_123", "fp_abc")).toEqual({
      "x-owner-token": "tok_123",
      "x-user-fingerprint": "fp_abc",
    });
  });
});

describe("client-api: apiFetch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns ok result for successful JSON response", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: "1", name: "test" }));

    const result = await apiFetch<{ id: string; name: string }>("/api/test");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe("1");
      expect(result.data.name).toBe("test");
    }
  });

  it("sends ownerToken in headers", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

    await apiFetch("/api/test", { ownerToken: "tok_abc" });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-owner-token": "tok_abc" }),
      })
    );
  });

  it("sends fingerprint in headers", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

    await apiFetch("/api/test", { fingerprint: "fp_123" });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-user-fingerprint": "fp_123" }),
      })
    );
  });

  it("sends JSON body with Content-Type header", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

    await apiFetch("/api/test", { method: "POST", body: { key: "value" } });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ key: "value" }),
      })
    );
  });

  it("returns error result for HTTP error with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ code: "NOT_FOUND", message: "Not found", traceId: "abc123" }, 404)
    );

    const result = await apiFetch("/api/test");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.data.code).toBe("NOT_FOUND");
      expect(result.data.message).toBe("Not found");
      expect(result.data.traceId).toBe("abc123");
    }
  });

  it("returns error result for HTTP error with non-JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: () => Promise.reject(new Error("not json")),
    });

    const result = await apiFetch("/api/test");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.data.code).toBe("UNKNOWN");
    }
  });

  it("returns blob for responseType=blob", async () => {
    const blob = new Blob(["test data"]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/octet-stream" }),
      blob: () => Promise.resolve(blob),
    });

    const result = await apiFetch<Blob>("/api/test", { responseType: "blob" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(blob);
    }
  });
});

describe("client-api: throwApiError", () => {
  it("returns data for ok result", () => {
    const result = { ok: true as const, data: { id: "1" } };
    expect(throwApiError(result)).toEqual({ id: "1" });
  });

  it("throws error for non-ok result", () => {
    const result = {
      ok: false as const,
      data: { code: "FORBIDDEN", message: "Access denied", traceId: "t1" },
      status: 403,
    };

    expect(() => throwApiError(result)).toThrow("Access denied");
  });

  it("preserves traceId on thrown error", () => {
    const result = {
      ok: false as const,
      data: { code: "INTERNAL", message: "Server error", traceId: "trace_xyz" },
      status: 500,
    };

    try {
      throwApiError(result);
    } catch (error) {
      expect((error as Error & { traceId?: string }).traceId).toBe("trace_xyz");
    }
  });
});

describe("client-api: formatApiError", () => {
  it("formats error with message and traceId", () => {
    const result = {
      ok: false as const,
      data: { code: "NOT_FOUND", message: "Not found", traceId: "abc" },
      status: 404,
    };
    expect(formatApiError(result)).toBe("Not found (trace: abc)");
  });

  it("formats error with fallback to HTTP status", () => {
    const result = {
      ok: false as const,
      data: { code: "UNKNOWN", message: "", traceId: "" },
      status: 500,
    };
    expect(formatApiError(result)).toBe("HTTP 500");
  });
});
