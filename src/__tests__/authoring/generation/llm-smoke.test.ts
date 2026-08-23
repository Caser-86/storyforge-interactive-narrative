import { describe, expect, it } from "vitest";
import { buildSmokeReport } from "@/lib/authoring/generation/smoke";

describe("manual LLM smoke report", () => {
  it("contains only safe structured provider metrics", () => {
    const report = buildSmokeReport({
      model: "deepseek-v4-flash",
      inputTokens: 12,
      outputTokens: 34,
      latencyMs: 567,
    });

    expect(report).toEqual({ status: "passed", model: "deepseek-v4-flash", inputTokens: 12, outputTokens: 34, latencyMs: 567 });
    expect(JSON.stringify(report)).not.toContain("api.deepseek.com");
    expect(JSON.stringify(report)).not.toContain("OPENAI_API_KEY");
  });
});
