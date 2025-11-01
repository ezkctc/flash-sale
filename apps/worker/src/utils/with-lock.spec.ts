import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';

// Mock Redis
vi.mock('ioredis');

// Utility function to test (extracted from main.ts logic)
async function withLock<T>(
  redis: Redis,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<{ ok: boolean; reason?: 'lock_busy' } | T> {
  const token = `${Date.now()}:${Math.random()}`;
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') return { ok: false, reason: 'lock_busy' as const };

  try {
    return await fn();
  } finally {
    const val = await redis.get(key);
    if (val === token) await redis.del(key);
  }
}

describe('withLock Utility', () => {
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedis = {
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);
  });

  it('should fail to acquire lock when already held', async () => {
    const mockFn = vi.fn();

    mockRedis.set.mockResolvedValue(null); // Lock not acquired

    const result = await withLock(mockRedis, 'test-key', 5000, mockFn);

    expect(result).toEqual({ ok: false, reason: 'lock_busy' });
    expect(mockFn).not.toHaveBeenCalled();
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('should not delete lock if token has changed', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue('different-token'); // Token changed

    // Mock token generation
    const originalDateNow = Date.now;
    const originalMathRandom = Math.random;
    Date.now = vi.fn().mockReturnValue(12345);
    Math.random = vi.fn().mockReturnValue(0.5);

    const result = await withLock(mockRedis, 'test-key', 5000, mockFn);

    expect(result).toBe('success');
    expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    expect(mockRedis.del).not.toHaveBeenCalled(); // Should not delete if token doesn't match

    // Restore original functions
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
  });

  it('should handle Redis errors gracefully', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    mockRedis.set.mockRejectedValue(new Error('Redis error'));

    await expect(withLock(mockRedis, 'test-key', 5000, mockFn)).rejects.toThrow(
      'Redis error'
    );
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('should handle cleanup errors gracefully', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    const token = 'test-token';

    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue(token);
    mockRedis.del.mockRejectedValue(new Error('Cleanup failed'));

    // Mock token generation
    const originalDateNow = Date.now;
    const originalMathRandom = Math.random;
    Date.now = vi.fn().mockReturnValue(12345);
    Math.random = vi.fn().mockReturnValue(0.5);

    // Should still return success even if cleanup fails
    const result = await withLock(mockRedis, 'test-key', 5000, mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalled();

    // Restore original functions
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
  });
});
