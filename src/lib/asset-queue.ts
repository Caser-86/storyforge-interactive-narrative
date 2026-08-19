import { Queue, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import type { ArtPrompt } from "./schemas";
import { readIntEnv } from "./env";
import { getErrorMessage } from "./errors";

const ASSET_QUEUE = "asset-generation";

let _connection: Redis | null = null;
let _queue: Queue | null = null;
let _available: boolean | null = null;

function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required when the asset queue is enabled");
  }
  return redisUrl;
}

function assertQueueConfigured(): void {
  if (!isQueueConfigured()) {
    throw new Error("Asset queue is not configured");
  }
}

export function isQueueConfigured(env = process.env): boolean {
  return env.ENABLE_IMAGE_GENERATION === "true"
    && env.DISABLE_REDIS !== "true"
    && typeof env.REDIS_URL === "string"
    && env.REDIS_URL.trim().length > 0;
}

async function probeRedis(): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  try {
    const conn = new Redis(getRedisUrl(), {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    conn.on("error", () => {});
    await conn.connect();
    await conn.ping();
    await conn.quit();
    _available = true;
    return true;
  } catch {
    _available = false;
    return false;
  }
}

function createRedisClient(): Redis {
  const conn = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error("[Redis] Max retry attempts reached, giving up");
        return null;
      }
      const delay = Math.min(times * 1000, 5000);
      console.warn(`[Redis] Retry connection in ${delay}ms (attempt ${times})`);
      return delay;
    },
    enableOfflineQueue: true,
  });

  conn.on("error", (err) => {
    console.warn("[Redis] Connection error:", err.message);
  });

  conn.on("close", () => {
    console.warn("[Redis] Connection closed");
    _available = false;
  });

  conn.on("reconnecting", () => {
    console.log("[Redis] Reconnecting...");
  });

  conn.on("ready", () => {
    console.log("[Redis] Connection ready");
    _available = true;
  });

  return conn;
}

export function getConnection(): ConnectionOptions {
  assertQueueConfigured();
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error("[Redis] Max retry attempts reached, giving up");
        return null;
      }
      const delay = Math.min(times * 1000, 5000);
      console.warn(`[Redis] Retry connection in ${delay}ms (attempt ${times})`);
      return delay;
    },
    enableOfflineQueue: true,
  };
}

export function getWorkerConnection(): ConnectionOptions {
  assertQueueConfigured();
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error("[Redis] Max retry attempts reached, giving up");
        return null;
      }
      const delay = Math.min(times * 1000, 5000);
      console.warn(`[Redis] Retry connection in ${delay}ms (attempt ${times})`);
      return delay;
    },
    enableOfflineQueue: true,
  };
}

export function getRedisClient(): Redis {
  if (!_connection) {
    assertQueueConfigured();
    _connection = createRedisClient();
  }
  return _connection;
}

export function getAssetQueue(): Queue {
  if (!_queue) {
    assertQueueConfigured();
    _queue = new Queue(ASSET_QUEUE, { connection: getConnection() });
  }
  return _queue;
}

export function isQueueAvailable(): boolean {
  if (!isQueueConfigured()) return false;
  return _available !== false;
}

export async function ensureQueueReady(): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  if (_available !== null) return _available;
  return probeRedis();
}

export interface AssetJobData {
  assetJobId: string;
  sessionId: string;
  sceneId: string;
  promptJson: ArtPrompt;
  provider: string;
  quality?: "draft" | "standard" | "high";
  bypassCache?: boolean;
}

export async function enqueueAssetJob(data: AssetJobData): Promise<{ queued: boolean; reason?: string }> {
  if (!isQueueConfigured()) {
    return { queued: false, reason: "Redis queue not configured" };
  }

  if (_available === false) {
    return { queued: false, reason: "Redis not available" };
  }

  try {
    if (_available === null) {
      const ready = await probeRedis();
      if (!ready) return { queued: false, reason: "Redis not available" };
    }
    const queue = getAssetQueue();
    const attempts = readIntEnv("ASSET_JOB_ATTEMPTS", 3, { min: 1 });
    const backoffDelay = readIntEnv("ASSET_JOB_BACKOFF_MS", 5000, { min: 0 });
    await queue.add("generate-image", data, {
      attempts,
      backoff: { type: "exponential", delay: backoffDelay },
      removeOnComplete: 100,
      removeOnFail: 50,
      jobId: data.assetJobId,
    });
    return { queued: true };
  } catch (err) {
    _available = false;
    const reason = getErrorMessage(err);
    console.warn("[AssetQueue] Failed to enqueue:", reason);
    return { queued: false, reason };
  }
}

export async function getQueueHealth() {
  if (!isQueueConfigured()) return "disabled" as const;
  if (_available === false) return null;

  try {
    const queue = getAssetQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  } catch {
    return null;
  }
}
