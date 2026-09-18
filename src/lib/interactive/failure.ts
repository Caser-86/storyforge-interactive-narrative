import { AuthoringError } from "@/lib/authoring/errors";
import { classifyProviderError } from "@/lib/authoring/generation/provider-errors";

export type InteractiveGenerationPhase = "opening" | "next";

export function interactiveGenerationFailureMessage(error: unknown, phase: InteractiveGenerationPhase): string {
  const code = error instanceof AuthoringError ? "UNKNOWN" : classifyProviderError(error).code;

  if (phase === "opening") {
    switch (code) {
      case "TIMEOUT":
        return "开场生成超时，请重试。";
      case "NETWORK":
        return "模型服务网络异常，请重试。";
      case "RATE_LIMIT":
        return "模型服务限流，请稍后重试。";
      case "AUTH":
        return "模型鉴权失败，请检查 API 配置后重试。";
      case "EMPTY":
      case "SCHEMA":
        return "模型返回内容无法解析，请重试。";
      default:
        return "开场生成失败，请重试。";
    }
  }

  switch (code) {
    case "TIMEOUT":
      return "模型请求超时，当前选择已恢复，可以重新选择。";
    case "NETWORK":
      return "模型服务网络异常，当前选择已恢复，可以重新选择。";
    case "RATE_LIMIT":
      return "模型服务限流，当前选择已恢复，可以稍后重试。";
    case "AUTH":
      return "模型鉴权失败，请检查 API 配置后重试。";
    case "EMPTY":
    case "SCHEMA":
      return "模型返回内容无法解析，当前选择已恢复，可以重新选择。";
    default:
      return "下一幕生成失败，当前选择已恢复，可以重新选择。";
  }
}
