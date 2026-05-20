/**
 * Simple in-memory sliding-window rate limiter.
 * Good enough for a single-instance deployment. For multi-instance,
 * swap to Redis-based tracking.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => now - t < 900_000); // 15 min
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/**
 * Check if a key has exceeded the rate limit.
 * @returns { success: true } if allowed, { success: false, retryAfter } if blocked.
 */
export function rateLimit(
  key: string,
  { maxAttempts = 5, windowMs = 60_000 }: { maxAttempts?: number; windowMs?: number } = {}
): { success: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= maxAttempts) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return { success: false, retryAfter };
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return { success: true };
}
