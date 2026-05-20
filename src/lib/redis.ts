import Redis from 'ioredis';

const globalForRedis = global as unknown as { redis: Redis | undefined };

export async function redisClient(): Promise<Redis> {
  if (globalForRedis.redis) return globalForRedis.redis;
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await client.connect();
  // Store singleton on global unconditionally — not just in dev — so production
  // does not create a new Redis connection on every JWT auth callback invocation.
  // This mirrors the db.ts singleton pattern exactly.
  globalForRedis.redis = client;
  return client;
}

// Blocklist helpers
export async function addToBlocklist(jti: string, ttlSeconds: number): Promise<void> {
  const redis = await redisClient();
  await redis.set(`blocklist:${jti}`, '1', 'EX', ttlSeconds);
}

export async function isBlocklisted(jti: string): Promise<boolean> {
  const redis = await redisClient();
  const val = await redis.get(`blocklist:${jti}`);
  return val !== null;
}
