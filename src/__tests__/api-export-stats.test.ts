import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  query: mockQuery,
  initDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/crypto", () => ({
  verifyToken: vi.fn().mockImplementation((token: string, hash: string) => {
    return Promise.resolve(token === hash);
  }),
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: async (code: string, message: string, status: number) => {
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ code, message, traceId: "test" }, { status });
  },
  ErrorCodes: {
    NOT_FOUND: "NOT_FOUND",
    FORBIDDEN: "FORBIDDEN",
    VALIDATION: "VALIDATION",
    INTERNAL: "INTERNAL",
  },
}));

describe("Export API - owner token permission", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 403 when owner token is missing for private session", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "sess_1", owner_token: "hashed_token", seed_prompt: "test", genre: "mystery", language: "zh-CN", rating: "PG-13", status: "active", state_json: "{}", created_at: new Date().toISOString() }],
    });

    const req = new Request("http://localhost/api/games/sess_1/export?format=json", {
      headers: {},
    });

    const { GET } = await import("@/app/api/games/[sessionId]/export/route");
    const res = await GET(req, { params: Promise.resolve({ sessionId: "sess_1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when session does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = new Request("http://localhost/api/games/sess_missing/export?format=json", {
      headers: { "x-owner-token": "any" },
    });

    const { GET } = await import("@/app/api/games/[sessionId]/export/route");
    const res = await GET(req, { params: Promise.resolve({ sessionId: "sess_missing" }) });
    expect(res.status).toBe(404);
  });
});

describe("Stats API - SQL field correctness", () => {
  it("uses timestamp field for llm_logs (not created_at)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/stats/route.ts"),
      "utf-8"
    );
    expect(content).toContain("FROM llm_logs WHERE timestamp > NOW()");
    expect(content).not.toContain("FROM llm_logs WHERE created_at > NOW()");
  });
});
