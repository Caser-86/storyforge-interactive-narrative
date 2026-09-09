import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import { interactiveGenerationFailureMessage } from "@/lib/interactive/failure";

describe("interactive generation failure messages", () => {
  it("keeps opening errors safe and actionable", () => {
    const error = new ProviderError("AUTH", "invalid key sk-secret-value", false);

    expect(interactiveGenerationFailureMessage(error, "opening")).toBe("模型鉴权失败，请检查 API 配置后重试。");
    expect(interactiveGenerationFailureMessage(error, "opening")).not.toContain("sk-secret-value");
  });

  it("keeps next-scene timeout errors retryable", () => {
    const error = new Error("Request timed out.");

    expect(interactiveGenerationFailureMessage(error, "next")).toBe("模型请求超时，当前选择已恢复，可以重新选择。");
  });
});
