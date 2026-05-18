import { describe, it, expect } from "vitest";
import { apiError, ErrorCodes } from "@/lib/api-errors";

describe("apiError", () => {
  it("returns correct structure with traceId", async () => {
    const response = apiError(ErrorCodes.VALIDATION, "Test error", 400);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.message).toBe("Test error");
    expect(body.traceId).toBeDefined();
    expect(body.traceId).toHaveLength(12);
  });

  it("defaults to 500 status", () => {
    const response = apiError(ErrorCodes.INTERNAL, "Server error");
    expect(response.status).toBe(500);
  });

  it("includes all error codes", () => {
    const codes = Object.values(ErrorCodes);
    expect(codes).toContain("NOT_FOUND");
    expect(codes).toContain("VALIDATION");
    expect(codes).toContain("RATE_LIMIT");
    expect(codes).toContain("SESSION_INACTIVE");
    expect(codes).toContain("DUPLICATE");
    expect(codes).toContain("LLM_FAILURE");
    expect(codes).toContain("FORBIDDEN");
    expect(codes).toContain("INTERNAL");
  });
});
