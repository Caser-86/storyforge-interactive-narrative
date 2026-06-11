import { describe, expect, it } from "vitest";
import { formatLlmActivation, parseLlmHealth } from "@/lib/llm-status";

describe("llm status UI text", () => {
  it("formats active real model for customer-facing display", () => {
    const status = parseLlmHealth({
      checks: {
        llm: {
          status: "configured",
          details: {
            active: true,
            mode: "real",
            model: "deepseek-v4-flash",
          },
        },
      },
    });

    expect(status.model).toBe("deepseek-v4-flash");
    expect(formatLlmActivation(status)).toBe("已激活");
  });

  it("formats mock mode as inactive", () => {
    const status = parseLlmHealth({
      checks: {
        llm: {
          status: "mock",
          details: {
            active: false,
            mode: "mock",
            model: "deepseek-v4-flash",
          },
        },
      },
    });

    expect(status.model).toBe("deepseek-v4-flash");
    expect(formatLlmActivation(status)).toBe("未激活");
  });
});
