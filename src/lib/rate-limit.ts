interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private counts: Map<string, number> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  async incr(key: string): Promise<number> {
    const val = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, val);
    return val;
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (this.timers.has(key)) return;
    this.timers.set(
      key,
      setTimeout(() => {
        this.counts.delete(key);
        this.timers.delete(key);
      }, seconds * 1000)
    );
  }
}

class RedisRateLimitStore implements RateLimitStore {
  private client: import("ioredis").Redis;

  constructor(client: import("ioredis").Redis) {
    this.client = client;
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(`rl:${key}`);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(`rl:${key}`, seconds);
  }
}

let store: RateLimitStore | null = null;

async function getStore(): Promise<RateLimitStore> {
  if (store) return store;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && process.env.DISABLE_REDIS !== "true") {
    try {
      const { default: Redis } = await import("ioredis");
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 2) return null;
          return Math.min(times * 500, 2000);
        },
      });
      client.on("error", () => {});
      await client.connect().catch(() => {});
      await client.ping().catch(() => {
        throw new Error("Redis ping failed");
      });
      store = new RedisRateLimitStore(client);
      console.log("[RateLimit] Using Redis store");
      return store;
    } catch {
      console.warn("[RateLimit] Redis unavailable, falling back to memory store");
    }
  }

  store = new MemoryRateLimitStore();
  console.log("[RateLimit] Using memory store");
  return store;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

export async function checkRateLimit(
  sessionId: string,
  ip: string,
  limits: { perSession: number; perIp: number; windowSeconds: number } = {
    perSession: 50,
    perIp: 100,
    windowSeconds: 60,
  }
): Promise<RateLimitResult> {
  const s = await getStore();

  const sessionKey = `sess:${sessionId}`;
  const ipKey = `ip:${ip}`;

  const [sessionCount, ipCount] = await Promise.all([
    s.incr(sessionKey),
    s.incr(ipKey),
  ]);

  if (sessionCount === 1) await s.expire(sessionKey, limits.windowSeconds);
  if (ipCount === 1) await s.expire(ipKey, limits.windowSeconds);

  if (sessionCount > limits.perSession) {
    return { allowed: false, reason: "Session rate limit exceeded", remaining: 0 };
  }

  if (ipCount > limits.perIp) {
    return { allowed: false, reason: "IP rate limit exceeded", remaining: 0 };
  }

  return {
    allowed: true,
    remaining: Math.min(
      limits.perSession - sessionCount,
      limits.perIp - ipCount
    ),
  };
}
