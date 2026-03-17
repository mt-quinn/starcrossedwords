import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
type StoredValue = { value: unknown };

function getMemoryStore(): Map<string, StoredValue> {
  const globalState = globalThis as typeof globalThis & {
    __STARCROSSEDWORDS_MEM_KV__?: Map<string, StoredValue>;
  };

  if (!globalState.__STARCROSSEDWORDS_MEM_KV__) {
    globalState.__STARCROSSEDWORDS_MEM_KV__ = new Map<string, StoredValue>();
  }

  return globalState.__STARCROSSEDWORDS_MEM_KV__;
}

export function hasKvEnv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function hasUpstashEnv(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function hasRedisEnv(): boolean {
  return hasKvEnv() || hasUpstashEnv();
}

function getRedisCredentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  return { url, token };
}

export function getRedis() {
  if (!redisClient) {
    const { url, token } = getRedisCredentials();
    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (hasRedisEnv()) {
    return (await getRedis().get<T>(key)) ?? null;
  }

  const storedValue = getMemoryStore().get(key);
  return (storedValue?.value as T | undefined) ?? null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasRedisEnv()) {
    await getRedis().set(key, value);
    return;
  }

  getMemoryStore().set(key, { value });
}

export async function kvDelete(key: string): Promise<void> {
  if (hasRedisEnv()) {
    await getRedis().del(key);
    return;
  }

  getMemoryStore().delete(key);
}
