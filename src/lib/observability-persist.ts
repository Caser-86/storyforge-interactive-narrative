import { query } from "./db";
import type { LlmLogEntry, AssetLogEntry } from "./observability";
import { readIntEnv } from "./env";
import { getErrorMessage } from "./errors";

function toDbBoolean(value: boolean): 1 | 0 {
  return value ? 1 : 0;
}

export async function persistLlmLog(entry: LlmLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO llm_logs (session_id, scene_id, model, latency_ms, input_tokens, output_tokens, retry_count, success, error, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.sessionId,
        entry.sceneId || null,
        entry.model,
        entry.latencyMs,
        entry.inputTokens || null,
        entry.outputTokens || null,
        entry.retryCount,
        toDbBoolean(entry.success),
        entry.error || null,
        entry.timestamp,
      ]
    );
  } catch (err) {
    console.warn("[Observability] Failed to persist LLM log:", getErrorMessage(err));
  }
}

export async function persistAssetLog(entry: AssetLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO asset_logs (asset_job_id, session_id, scene_id, provider, type, latency_ms, success, error, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.assetJobId,
        entry.sessionId,
        entry.sceneId,
        entry.provider,
        entry.type,
        entry.latencyMs || null,
        toDbBoolean(entry.success),
        entry.error || null,
        entry.timestamp,
      ]
    );
  } catch (err) {
    console.warn("[Observability] Failed to persist asset log:", getErrorMessage(err));
  }
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

const circuitBreakers: Map<string, CircuitBreakerState> = new Map();

const CB_THRESHOLD = 5;
const CB_RESET_MS = 60000;

export function isCircuitOpen(provider: string): boolean {
  const state = circuitBreakers.get(provider);
  if (!state) return false;

  if (state.open && Date.now() - state.lastFailure > CB_RESET_MS) {
    state.open = false;
    state.failures = 0;
    return false;
  }

  return state.open;
}

export function recordFailure(provider: string): void {
  const state = circuitBreakers.get(provider) || { failures: 0, lastFailure: 0, open: false };
  state.failures++;
  state.lastFailure = Date.now();

  if (state.failures >= CB_THRESHOLD) {
    state.open = true;
    console.warn(`[CircuitBreaker] ${provider} circuit OPEN after ${state.failures} failures`);
  }

  circuitBreakers.set(provider, state);
}

export function recordSuccess(provider: string): void {
  const state = circuitBreakers.get(provider);
  if (state) {
    state.failures = 0;
    state.open = false;
  }
}

interface DailyCostEntry {
  llmTokens: number;
  assetCalls: number;
  date: string;
}

let dailyCost: DailyCostEntry = { llmTokens: 0, assetCalls: 0, date: new Date().toISOString().slice(0, 10) };

export function trackLlmTokens(tokens: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCost.date !== today) {
    dailyCost = { llmTokens: 0, assetCalls: 0, date: today };
  }
  dailyCost.llmTokens += tokens;
}

export function trackAssetCall(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCost.date !== today) {
    dailyCost = { llmTokens: 0, assetCalls: 0, date: today };
  }
  dailyCost.assetCalls++;
}

export function getDailyCost(): DailyCostEntry & { llmCostEstimate: number } {
  return {
    ...dailyCost,
    llmCostEstimate: dailyCost.llmTokens * 0.00002,
  };
}

const DAILY_TOKEN_LIMIT = readIntEnv("DAILY_TOKEN_LIMIT", 1000000, { min: 0 });
const DAILY_ASSET_LIMIT = readIntEnv("DAILY_ASSET_LIMIT", 500, { min: 0 });

export function isWithinBudget(): boolean {
  return dailyCost.llmTokens < DAILY_TOKEN_LIMIT && dailyCost.assetCalls < DAILY_ASSET_LIMIT;
}
