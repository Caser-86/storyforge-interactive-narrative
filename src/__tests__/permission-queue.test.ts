import { describe, it, expect, vi, beforeEach } from "vitest";
import { signStreamToken, verifyStreamToken } from "@/lib/crypto";

const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  query: mockQuery,
  initDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/crypto", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crypto")>("@/lib/crypto");
  return {
    ...actual,
    verifyToken: vi.fn().mockImplementation((token: string, hash: string) => {
      return Promise.resolve(token === hash);
    }),
  };
});

vi.mock("@/lib/api-errors", () => ({
  apiError: async (code: string, message: string, status: number) => {
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ code, message, traceId: "test" }, { status });
  },
  ErrorCodes: {
    NOT_FOUND: "NOT_FOUND",
    AUTH: "AUTH",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    VALIDATION: "VALIDATION",
    INTERNAL: "INTERNAL",
  },
}));

describe("API Permission: owner token required for private sessions", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("GET /api/games/[sessionId] returns 403 when token missing for private session", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1", owner_token: "hashed_token", seed_prompt: "", genre: "", language: "", rating: "", status: "", current_scene_id: "", state_json: "{}", created_at: "", updated_at: "" }],
    });

    const req = new Request("http://localhost/api/games/s1", { headers: {} });
    const { GET } = await import("@/app/api/games/[sessionId]/route");
    const res = await GET(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("PATCH /api/games/[sessionId] returns 403 when token mismatch", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1", owner_token: "hashed_token" }],
    });

    const req = new Request("http://localhost/api/games/s1", {
      method: "PATCH",
      headers: { "x-owner-token": "wrong_token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    Object.defineProperty(req, "json", { value: async () => ({ status: "ended" }) });

    const { PATCH } = await import("@/app/api/games/[sessionId]/route");
    const res = await PATCH(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/games/[sessionId] returns 403 when token missing", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1", owner_token: "hashed_token" }],
    });

    const req = new Request("http://localhost/api/games/s1", {
      method: "DELETE",
      headers: {},
    });

    const { DELETE } = await import("@/app/api/games/[sessionId]/route");
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
  });
});

describe("Asset queue: enqueueAssetJob graceful degradation", () => {
  it("returns queued=false when Redis is disabled", async () => {
    process.env.DISABLE_REDIS = "true";
    vi.resetModules();

    const { enqueueAssetJob } = await import("@/lib/asset-queue");
    const result = await enqueueAssetJob({
      assetJobId: "test",
      sessionId: "s1",
      sceneId: "sc1",
      promptJson: { prompt: "", negativePrompt: "", aspectRatio: "16:9" as const, seedHint: 0, styleLock: "" },
      provider: "mock",
    });

    expect(result.queued).toBe(false);
    expect(result.reason).toBeTruthy();

    delete process.env.DISABLE_REDIS;
  });
});

describe("SSE stream token", () => {
  it("signs and verifies a valid stream token", () => {
    const token = signStreamToken("session-1", "owner-token-1");
    const result = verifyStreamToken(token, "session-1");
    expect(result.valid).toBe(true);
  });

  it("rejects token with wrong sessionId", () => {
    const token = signStreamToken("session-1", "owner-token-1");
    const result = verifyStreamToken(token, "session-2");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Session mismatch");
  });

  it("rejects expired token", () => {
    const originalNow = Date.now;
    const fixedNow = Date.now();
    Date.now = () => fixedNow;

    const token = signStreamToken("session-1", "owner-token-1");

    Date.now = () => fixedNow + 121 * 1000;
    const result = verifyStreamToken(token, "session-1");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Token expired");

    Date.now = originalNow;
  });

  it("rejects tampered token", () => {
    const token = signStreamToken("session-1", "owner-token-1");
    const tampered = token.slice(0, -2) + "XX";
    const result = verifyStreamToken(tampered, "session-1");
    expect(result.valid).toBe(false);
  });

  it("rejects missing streamToken on SSE endpoint", async () => {
    const { GET } = await import("@/app/api/games/[sessionId]/events/route");
    const req = new Request("http://localhost/api/games/s1/events");
    const res = await GET(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("events-token POST returns 401 without owner token", async () => {
    const { POST } = await import("@/app/api/games/[sessionId]/events-token/route");
    const req = new Request("http://localhost/api/games/s1/events-token", {
      method: "POST",
      headers: {},
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(401);
  });
});

describe("Session restore: owner token required for private sessions", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("GET /api/games/[sessionId] returns 403 without owner token for private session", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ owner_token: "hashed_token" }],
    });

    const { GET } = await import("@/app/api/games/[sessionId]/route");
    const req = new Request("http://localhost/api/games/s1", { headers: {} });
    const res = await GET(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("GET /api/games/[sessionId] returns 403 with wrong owner token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ owner_token: "hashed_token" }],
    });

    const { GET } = await import("@/app/api/games/[sessionId]/route");
    const req = new Request("http://localhost/api/games/s1", {
      headers: { "x-owner-token": "wrong_token" },
    });
    const res = await GET(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("POST /api/games/[sessionId]/share returns 403 for R-rated content", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1", status: "active", rating: "R", owner_token: null }],
    });

    const { POST } = await import("@/app/api/games/[sessionId]/share/route");
    const req = new Request("http://localhost/api/games/s1/share", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toContain("R-rated");
  });

  it("DELETE /api/games/[sessionId]/share revokes share token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1", owner_token: null, share_token: "existing_hash" }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1" }],
    });

    const { DELETE } = await import("@/app/api/games/[sessionId]/share/route");
    const req = new Request("http://localhost/api/games/s1/share", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(true);
  });

  it("DELETE /api/games/[sessionId]/share returns 404 when no active share", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "s1", owner_token: null, share_token: null }],
    });

    const { DELETE } = await import("@/app/api/games/[sessionId]/share/route");
    const req = new Request("http://localhost/api/games/s1/share", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(404);
  });
});
