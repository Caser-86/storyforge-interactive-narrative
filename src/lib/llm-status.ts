export interface LlmHealthResponse {
  checks?: {
    llm?: {
      status?: string;
      details?: {
        active?: boolean;
        mode?: string;
        model?: string;
        baseUrl?: string;
        hint?: string;
      };
    };
  };
}

export interface LlmDisplayStatus {
  state: "checking" | "active" | "inactive" | "unknown";
  model: string;
  mode?: string;
}

export function parseLlmHealth(health?: LlmHealthResponse): LlmDisplayStatus {
  const llm = health?.checks?.llm;
  const details = llm?.details;
  const mode = details?.mode || llm?.status;
  const model = details?.model || "未配置";

  if (!llm) return { state: "unknown", model };
  if (details?.active === true) return { state: "active", model, mode };
  if (mode === "mock" || mode === "not_configured" || details?.active === false) {
    return { state: "inactive", model, mode };
  }
  return { state: "unknown", model, mode };
}

export function formatLlmActivation(status: LlmDisplayStatus): string {
  if (status.state === "active") return "已激活";
  if (status.state === "checking") return "检测中";
  return "未激活";
}
