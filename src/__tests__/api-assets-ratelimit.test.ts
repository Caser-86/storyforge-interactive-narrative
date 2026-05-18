import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  initDb: vi.fn(),
  query: vi.fn(),
}));

import { query } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

describe("Asset job status transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/assets/[id] returns 404 for non-existent job", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], duration: 0 });
    const { GET } = await import("@/app/api/assets/[assetJobId]/route");
    const req = new Request("http://localhost:3000/api/assets/asset_nonexist");
    const res = await GET(req, { params: Promise.resolve({ assetJobId: "asset_nonexist" }) });
    expect(res.status).toBe(404);
  });

  it("GET /api/assets/[id] returns job with versions", async () => {
    (query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes("FROM asset_jobs")) {
        return {
          rows: [{
            id: "asset_test", type: "image", provider: "mock",
            status: "completed", url: "https://example.com/img.png",
            error: null, prompt_hash: "sha256:abc",
          }],
          duration: 0,
        };
      }
      if (sql.includes("FROM asset_versions")) {
        return {
          rows: [
            { id: "ver_1", url: "https://example.com/old.png", prompt_hash: "sha256:old", provider: "mock", version: 1, created_at: new Date().toISOString() },
          ],
          duration: 0,
        };
      }
      return { rows: [], duration: 0 };
    });
    const { GET } = await import("@/app/api/assets/[assetJobId]/route");
    const req = new Request("http://localhost:3000/api/assets/asset_test");
    const res = await GET(req, { params: Promise.resolve({ assetJobId: "asset_test" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("asset_test");
    expect(body.status).toBe("completed");
    expect(body.versions).toHaveLength(1);
  });
});

describe("Rate limit", () => {
  it("allows requests within limits", async () => {
    const result = await checkRateLimit("sess_test", "127.0.0.1", {
      perSession: 50,
      perIp: 100,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("blocks requests exceeding session limit", async () => {
    for (let i = 0; i < 51; i++) {
      await checkRateLimit("sess_limit_test", "127.0.0.1", {
        perSession: 50,
        perIp: 100,
        windowSeconds: 60,
      });
    }
    const result = await checkRateLimit("sess_limit_test", "127.0.0.1", {
      perSession: 50,
      perIp: 100,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Session");
  });
});
