import { persistLlmLog, persistAssetLog, trackLlmTokens, trackAssetCall } from "./observability-persist";

export interface LlmLogEntry {
  sessionId: string;
  sceneId?: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface AssetLogEntry {
  assetJobId: string;
  sessionId: string;
  sceneId: string;
  provider: string;
  type: string;
  latencyMs?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

const llmLogs: LlmLogEntry[] = [];
const assetLogs: AssetLogEntry[] = [];

export function logLlmCall(entry: LlmLogEntry) {
  llmLogs.push(entry);
  if (llmLogs.length > 1000) {
    llmLogs.shift();
  }
  console.log(
    `[LLM] session=${entry.sessionId} model=${entry.model} latency=${entry.latencyMs}ms retries=${entry.retryCount} success=${entry.success}`
  );
  const totalTokens = (entry.inputTokens || 0) + (entry.outputTokens || 0);
  if (totalTokens > 0) trackLlmTokens(totalTokens);
  persistLlmLog(entry).catch(() => {});
}

export function logAssetCall(entry: AssetLogEntry) {
  assetLogs.push(entry);
  if (assetLogs.length > 1000) {
    assetLogs.shift();
  }
  console.log(
    `[ASSET] job=${entry.assetJobId} provider=${entry.provider} type=${entry.type} success=${entry.success}`
  );
  trackAssetCall();
  persistAssetLog(entry).catch(() => {});
}

export function getLlmStats() {
  const recent = llmLogs.slice(-100);
  const latencies = recent.filter((e) => e.success).map((e) => e.latencyMs);
  const p50 = latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] : 0;
  const avgTokens = recent.length > 0
    ? recent.reduce((sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0) / recent.length
    : 0;

  return {
    totalCalls: llmLogs.length,
    successRate: recent.length > 0 ? recent.filter((e) => e.success).length / recent.length : 0,
    p50Latency: p50,
    p95Latency: p95,
    avgTokens,
    recentErrors: recent.filter((e) => !e.success).slice(-10),
  };
}

export function getAssetStats() {
  const recent = assetLogs.slice(-100);
  return {
    totalJobs: assetLogs.length,
    successRate: recent.length > 0 ? recent.filter((e) => e.success).length / recent.length : 0,
    byProvider: recent.reduce<Record<string, number>>((acc, e) => {
      acc[e.provider] = (acc[e.provider] || 0) + 1;
      return acc;
    }, {}),
  };
}
