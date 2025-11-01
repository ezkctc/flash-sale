import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { zsetKey } from '@flash-sale/shared-utils';

// Mock dependencies
vi.mock('ioredis');
vi.mock('bullmq');
vi.mock('@flash-sale/shared-utils');

// Queue operation utilities (extracted from main.ts logic)
async function popNextFromQueue(redis: Redis, saleId: string): Promise<[string, number] | null> {
  const queueKey = zsetKey(saleId);
  const popped = await (redis as any).zpopmin(queueKey, 1);
  
  if (!popped || popped.length < 2) {
    return null;
  }
  
  return [String(popped[0]), Number(popped[1])];
}

async function scheduleReleaseJob(
  queue: Queue,
  saleId: string,
  email: string,
  delayMs: number
): Promise<void> {
  await queue.add(
    'release_hold',
    { flashSaleId: saleId, email },
    {
      delay: delayMs,
      jobId: `release:${saleId}:${email}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

describe('Queue Operations', () => {
  let mockRedis: any;
  let mockQueue: any;
  let mockZsetKey: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedis = {
      zpopmin: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);

    mockQueue = {
      add: vi.fn(),
    };
    (Queue as any).mockImplementation(() => mockQueue);

    mockZsetKey = vi.fn((saleId: string) => `fsq:${saleId}`);
    (zsetKey as any).mockImplementation(mockZsetKey);
  });

  describe('popNextFromQueue', () => {
    it('should pop next user from queue successfully', async () => {
      mockRedis.zpopmin.mockResolvedValue(['user@example.com', 1234567890]);

      const result = await popNextFromQueue(mockRedis, 'sale-123');

      expect(result).toEqual(['user@example.com', 1234567890]);
      expect(mockRedis.zpopmin).toHaveBeenCalledWith('fsq:sale-123', 1);
      expect(mockZsetKey).toHaveBeenCalledWith('sale-123');
    });

    it('should return null when queue is empty', async () => {
      mockRedis.zpopmin.mockResolvedValue([]);

      const result = await popNextFromQueue(mockRedis, 'sale-123');

      expect(result).toBeNull();
    });

    it('should return null when zpopmin returns null', async () => {
      mockRedis.zpopmin.mockResolvedValue(null);

      const result = await popNextFromQueue(mockRedis, 'sale-123');

      expect(result).toBeNull();
    });

    it('should return null when zpopmin returns insufficient data', async () => {
      mockRedis.zpopmin.mockResolvedValue(['user@example.com']); // Missing score

      const result = await popNextFromQueue(mockRedis, 'sale-123');

      expect(result).toBeNull();
    });

    it('should handle Redis errors', async () => {
      mockRedis.zpopmin.mockRejectedValue(new Error('Redis error'));

      await expect(popNextFromQueue(mockRedis, 'sale-123')).rejects.toThrow('Redis error');
    });

    it('should convert values to correct types', async () => {
      mockRedis.zpopmin.mockResolvedValue([123, '1234567890.5']); // Number email, string score

      const result = await popNextFromQueue(mockRedis, 'sale-123');

      expect(result).toEqual(['123', 1234567890.5]);
    });
  });

  describe('scheduleReleaseJob', () => {
    it('should schedule release job with correct parameters', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await scheduleReleaseJob(mockQueue, 'sale-123', 'user@example.com', 900000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: 'sale-123', email: 'user@example.com' },
        {
          delay: 900000,
          jobId: 'release:sale-123:user@example.com',
          removeOnComplete: true,
          removeOnFail: true,
        }
      );
    });

    it('should handle queue errors', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(
        scheduleReleaseJob(mockQueue, 'sale-123', 'user@example.com', 900000)
      ).rejects.toThrow('Queue error');
    });

    it('should generate unique job IDs', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await scheduleReleaseJob(mockQueue, 'sale-123', 'user1@example.com', 900000);
      await scheduleReleaseJob(mockQueue, 'sale-123', 'user2@example.com', 900000);
      await scheduleReleaseJob(mockQueue, 'sale-456', 'user1@example.com', 900000);

      expect(mockQueue.add).toHaveBeenNthCalledWith(
        1,
        'release_hold',
        { flashSaleId: 'sale-123', email: 'user1@example.com' },
        expect.objectContaining({
          jobId: 'release:sale-123:user1@example.com',
        })
      );

      expect(mockQueue.add).toHaveBeenNthCalledWith(
        2,
        'release_hold',
        { flashSaleId: 'sale-123', email: 'user2@example.com' },
        expect.objectContaining({
          jobId: 'release:sale-123:user2@example.com',
        })
      );

      expect(mockQueue.add).toHaveBeenNthCalledWith(
        3,
        'release_hold',
        { flashSaleId: 'sale-456', email: 'user1@example.com' },
        expect.objectContaining({
          jobId: 'release:sale-456:user1@example.com',
        })
      );
    });

    it('should handle zero delay', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await scheduleReleaseJob(mockQueue, 'sale-123', 'user@example.com', 0);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: 'sale-123', email: 'user@example.com' },
        expect.objectContaining({
          delay: 0,
        })
      );
    });

    it('should handle large delay values', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });
      const largeDelay = 24 * 60 * 60 * 1000; // 24 hours

      await scheduleReleaseJob(mockQueue, 'sale-123', 'user@example.com', largeDelay);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: 'sale-123', email: 'user@example.com' },
        expect.objectContaining({
          delay: largeDelay,
        })
      );
    });
  });

  describe('Queue Operations Integration', () => {
    it('should handle complete queue cycle', async () => {
      // Pop user from queue
      mockRedis.zpopmin.mockResolvedValue(['user@example.com', 1234567890]);
      const poppedUser = await popNextFromQueue(mockRedis, 'sale-123');
      
      expect(poppedUser).toEqual(['user@example.com', 1234567890]);

      // Schedule release job for the user
      mockQueue.add.mockResolvedValue({ id: 'job-123' });
      await scheduleReleaseJob(mockQueue, 'sale-123', 'user@example.com', 900000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: 'sale-123', email: 'user@example.com' },
        expect.objectContaining({
          jobId: 'release:sale-123:user@example.com',
        })
      );
    });

    it('should handle empty queue gracefully', async () => {
      mockRedis.zpopmin.mockResolvedValue([]);
      const poppedUser = await popNextFromQueue(mockRedis, 'sale-123');
      
      expect(poppedUser).toBeNull();
      
      // Should not schedule job if no user was popped
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in email', async () => {
      const specialEmail = 'user+test@example.com';
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await scheduleReleaseJob(mockQueue, 'sale-123', specialEmail, 900000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: 'sale-123', email: specialEmail },
        expect.objectContaining({
          jobId: 'release:sale-123:user+test@example.com',
        })
      );
    });

    it('should handle special characters in sale ID', async () => {
      const specialSaleId = 'sale-123-test_special';
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await scheduleReleaseJob(mockQueue, specialSaleId, 'user@example.com', 900000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: specialSaleId, email: 'user@example.com' },
        expect.objectContaining({
          jobId: 'release:sale-123-test_special:user@example.com',
        })
      );
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(100) + '@example.com';
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await scheduleReleaseJob(mockQueue, 'sale-123', longEmail, 900000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release_hold',
        { flashSaleId: 'sale-123', email: longEmail },
        expect.objectContaining({
          jobId: `release:sale-123:${longEmail}`,
        })
      );
    });
  });
});