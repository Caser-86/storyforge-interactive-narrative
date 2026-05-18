import { describe, it, expect } from "vitest";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { checkOutputSafety, getRatingPromptSuffix, getCopyrightAuditLog } from "@/lib/safety-service";
import { hashToken, verifyToken, verifyAdminToken } from "@/lib/crypto";

describe("Share/Export contract", () => {
  it("apiError returns traceId for share/export errors", () => {
    const res = apiError(ErrorCodes.NOT_FOUND, "Share token not found", 404);
    expect(res.status).toBe(404);
  });

  it("apiError returns FORBIDDEN for unauthorized export", () => {
    const res = apiError(ErrorCodes.FORBIDDEN, "Invalid owner token", 403);
    expect(res.status).toBe(403);
  });
});

describe("Safety service extended", () => {
  it("checkOutputSafety detects unsafe body content", () => {
    const result = checkOutputSafety({
      body: "他决定自残以结束痛苦",
      npcs: [],
      artPrompt: "a peaceful garden",
      musicPrompt: "calm ambient",
    });
    expect(result.safe).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("checkOutputSafety detects copyright in artPrompt", () => {
    const result = checkOutputSafety({
      body: "一段普通故事",
      npcs: [],
      artPrompt: "Harry Potter standing in the great hall",
      musicPrompt: "epic orchestral",
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("checkOutputSafety detects artist imitation in musicPrompt", () => {
    const result = checkOutputSafety({
      body: "一段普通故事",
      npcs: [],
      artPrompt: "a forest scene",
      musicPrompt: "sounds like Hans Zimmer epic score",
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("checkOutputSafety passes clean content", () => {
    const result = checkOutputSafety({
      body: "勇者踏上了冒险的旅途",
      npcs: [{ dialogue: "欢迎来到我们的村庄", hiddenIntent: "观察勇者" }],
      artPrompt: "a fantasy village at sunset",
      musicPrompt: "peaceful village theme",
    });
    expect(result.safe).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  it("getRatingPromptSuffix returns appropriate constraints", () => {
    const g = getRatingPromptSuffix("G");
    expect(g).toContain("全年龄段");

    const pg13 = getRatingPromptSuffix("PG-13");
    expect(pg13).toContain("13岁以上");

    const r = getRatingPromptSuffix("R");
    expect(r).toContain("成人");
    expect(r).toContain("限制公开分享");
  });

  it("getRatingPromptSuffix defaults to PG-13 for unknown rating", () => {
    const unknown = getRatingPromptSuffix("XXX");
    expect(unknown).toContain("PG-13");
  });

  it("copyright audit log records replacements", () => {
    checkOutputSafety({
      body: "哈利波特走进了霍格沃茨",
      npcs: [],
      artPrompt: "",
      musicPrompt: "",
    });
    const log = getCopyrightAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].source).toBe("output_check");
  });
});

describe("Crypto timing-safe verification", () => {
  it("verifyToken accepts correct token", async () => {
    const token = "ot_test_token_12345678";
    const hash = await hashToken(token);
    const valid = await verifyToken(token, hash);
    expect(valid).toBe(true);
  });

  it("verifyToken rejects wrong token", async () => {
    const token = "ot_test_token_12345678";
    const hash = await hashToken(token);
    const valid = await verifyToken("ot_wrong_token_87654321", hash);
    expect(valid).toBe(false);
  });

  it("verifyToken rejects mismatched length", async () => {
    const token = "ot_test_token_12345678";
    const hash = await hashToken(token);
    const valid = await verifyToken("short", hash);
    expect(valid).toBe(false);
  });

  it("verifyAdminToken rejects null header", () => {
    expect(verifyAdminToken(null)).toBe(false);
  });

  it("verifyAdminToken rejects wrong bearer token", () => {
    expect(verifyAdminToken("Bearer wrong-token")).toBe(false);
  });
});
