export type SmokeMetrics = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export function buildSmokeReport(metrics: SmokeMetrics): { status: "passed"; } & SmokeMetrics {
  return { status: "passed", ...metrics };
}
