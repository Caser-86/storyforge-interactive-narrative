"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import {
  formatLlmActivation,
  parseLlmHealth,
  type LlmDisplayStatus,
  type LlmHealthResponse,
} from "@/lib/llm-status";

interface LlmStatusBannerProps {
  compact?: boolean;
}

const INITIAL_STATUS: LlmDisplayStatus = {
  state: "checking",
  model: "检测中",
};

export default function LlmStatusBanner({ compact = false }: LlmStatusBannerProps) {
  const [llmStatus, setLlmStatus] = useState<LlmDisplayStatus>(INITIAL_STATUS);

  useEffect(() => {
    let mounted = true;

    apiFetch<LlmHealthResponse>("/api/health")
      .then((result) => {
        if (!mounted) return;
        if (result.ok) {
          setLlmStatus(parseLlmHealth(result.data));
        } else {
          setLlmStatus({ state: "unknown", model: "未配置" });
        }
      })
      .catch(() => {
        if (mounted) setLlmStatus({ state: "unknown", model: "未配置" });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const active = llmStatus.state === "active";
  const checking = llmStatus.state === "checking";
  const activation = formatLlmActivation(llmStatus);

  return (
    <section
      data-testid={compact ? "story-llm-status-panel" : "llm-status-panel"}
      className={`rounded-lg border ${
        active
          ? "border-green-500/35 bg-green-500/8"
          : checking
            ? "border-[#333] bg-[#1a1a2e]/70"
            : "border-orange-500/35 bg-orange-500/10"
      } ${compact ? "mb-4 px-4 py-3" : "px-4 py-3"}`}
      aria-label="大模型状态"
    >
      <div className={compact ? "flex flex-wrap items-center gap-x-6 gap-y-2" : "grid gap-2"}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">当前模型：</span>
          <span className="text-sm font-medium text-gray-100">{llmStatus.model}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">激活状态：</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              active
                ? "bg-green-500/20 text-green-300"
                : checking
                  ? "bg-gray-500/20 text-gray-300"
                  : "bg-orange-500/20 text-orange-300"
            }`}
          >
            {activation}
          </span>
        </div>
      </div>
    </section>
  );
}
