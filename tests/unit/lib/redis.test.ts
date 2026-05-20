import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ioredis before importing our module
vi.mock('ioredis', () => {
  const mockRedis = vi.fn()
  mockRedis.prototype.connect = vi.fn().mockResolvedValue(undefined)
  mockRedis.prototype.set = vi.fn().mockResolvedValue('OK')
  mockRedis.prototype.get = vi.fn().mockResolvedValue(null)
  return { default: mockRedis }
})

import Redis from 'ioredis'

// We need to import after the mock is set up and reset the module each time
// to ensure singleton isolation between tests
const globalForRedis = global as unknown as { redis: Redis | undefined }

beforeEach(() => {
  // Reset singleton so each test starts fresh
  globalForRedis.redis = undefined
  vi.clearAllMocks()
})

describe('redisClient()', () => {
  it('returns a Redis instance', async () => {
    const { redisClient } = await import('@/lib/redis')
    const client = await redisClient()
    expect(client).toBeTruthy()
  })

  it('reuses singleton on second call', async () => {
    const { redisClient } = await import('@/lib/redis')
    const client1 = await redisClient()
    const client2 = await redisClient()
    expect(client1).toBe(client2)
  })

  it('uses REDIS_URL env var when set', async () => {
    const originalUrl = process.env.REDIS_URL
    process.env.REDIS_URL = 'redis://custom-host:6380'
    try {
      const { redisClient } = await import('@/lib/redis')
      await redisClient()
      expect(Redis).toHaveBeenCalledWith('redis://custom-host:6380', expect.any(Object))
    } finally {
      process.env.REDIS_URL = originalUrl
    }
  })

  it('falls back to redis://localhost:6379 when REDIS_URL is absent', async () => {
    const originalUrl = process.env.REDIS_URL
    delete process.env.REDIS_URL
    try {
      const { redisClient } = await import('@/lib/redis')
      await redisClient()
      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object))
    } finally {
      process.env.REDIS_URL = originalUrl
    }
  })
})

describe('addToBlocklist()', () => {
  it('sets a key with EX TTL in Redis', async () => {
    const { addToBlocklist } = await import('@/lib/redis')
    await addToBlocklist('jti-abc', 3600)
    const mockInstance = (Redis as unknown as ReturnType<typeof vi.fn>).mock.instances[0]
    expect(mockInstance.set).toHaveBeenCalledWith('blocklist:jti-abc', '1', 'EX', 3600)
  })
})

describe('isBlocklisted()', () => {
  it('returns true when key exists', async () => {
    const mockInstance = (Redis as unknown as ReturnType<typeof vi.fn>).mock.instances[0]
    if (mockInstance) {
      mockInstance.get = vi.fn().mockResolvedValue('1')
    } else {
      // Set up mock before first call
      ;(Redis.prototype.get as ReturnType<typeof vi.fn>).mockResolvedValue('1')
    }
    const { isBlocklisted } = await import('@/lib/redis')
    const result = await isBlocklisted('jti-xyz')
    expect(result).toBe(true)
  })

  it('returns false when key does not exist', async () => {
    ;(Redis.prototype.get as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const { isBlocklisted } = await import('@/lib/redis')
    const result = await isBlocklisted('jti-missing')
    expect(result).toBe(false)
  })
})
