import Redis from "ioredis";

interface MemoryEntry {
  expiresAt: number;
  value: string;
}

const memory = new Map<string, MemoryEntry>();
let redisClient: Redis | null = null;
let redisUnavailable = false;

const SHOP_CACHE_PREFIX = "shop:";

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUnavailable || !redisUrl) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    await client.connect();
    redisClient = client;
    return client;
  } catch {
    redisUnavailable = true;
    redisClient = null;
    return null;
  }
}

function readMemory<T>(key: string): T | null {
  const entry = memory.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }

  try {
    return JSON.parse(entry.value) as T;
  } catch {
    memory.delete(key);
    return null;
  }
}

function writeMemory(key: string, value: unknown, ttlMs: number) {
  memory.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + ttlMs,
  });
}

export async function tieredCacheGet<T>(key: string): Promise<T | null> {
  const memoryHit = readMemory<T>(key);
  if (memoryHit !== null) {
    return memoryHit;
  }

  const redis = await getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as T;
    writeMemory(key, parsed, 60_000);
    return parsed;
  } catch {
    return null;
  }
}

export async function tieredCacheSet(
  key: string,
  value: unknown,
  ttlMs: number
): Promise<void> {
  writeMemory(key, value, ttlMs);

  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.set(key, JSON.stringify(value), "PX", ttlMs);
  } catch {
    // Memory cache still serves the value.
  }
}

export function tieredCacheDeleteMemoryByPrefix(prefix: string) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) {
      memory.delete(key);
    }
  }
}

export async function tieredCacheDeleteByPrefix(prefix: string): Promise<void> {
  tieredCacheDeleteMemoryByPrefix(prefix);

  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys.length) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Stale Redis keys expire via TTL.
  }
}

export function shopCacheKey(...parts: string[]) {
  return `${SHOP_CACHE_PREFIX}${parts.join(":")}`;
}
