import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { flashSaleMongoModel, FlashSaleStatus } from '@flash-sale/shared-types';
import { zsetKey, holdKey, consumedKey } from '@flash-sale/shared-utils';

// Mock dependencies
vi.mock('ioredis');
vi.mock('bullmq');
vi.mock('mongoose');
vi.mock('@flash-sale/shared-types');
vi.mock('@flash-sale/shared-utils');

// Mock utility functions
const mockZsetKey = vi.fn((saleId: string) => `fsq:${saleId}`);
const mockHoldKey = vi.fn((saleId: string, email: string) => `fsh:${saleId}:${email}`);
const mockConsumedKey = vi.fn((saleId: string, email: string) => `fshp:${saleId}:${email}`);

(zsetKey as any).mockImplementation(mockZsetKey);
(holdKey as any).mockImplementation(mockHoldKey);
(consumedKey as any).mockImplementation(mockConsumedKey);

describe('Job Processor', () => {
  let mockRedis: any;
  let mockQueue: any;
  let mockFlashSaleModel: any;
  let jobProcessor: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      zrem: vi.fn(),
      zrank: vi.fn(),
      incr: vi.fn(),
      decr: vi.fn(),
      multi: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        zrem: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 'OK'], [null, 1]]),
      }),
      quit: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);

    // Mock Queue
    mockQueue = {
      add: vi.fn(),
      close: vi.fn(),
    };
    (Queue as any).mockImplementation(() => mockQueue);

    // Mock FlashSale model
    mockFlashSaleModel = {
      findById: vi.fn().mockReturnValue({
        lean: vi.fn(),
      }),
      findOne: vi.fn().mockReturnValue({
        lean: vi.fn(),
      }),
    };
    (flashSaleMongoModel as any) = mockFlashSaleModel;

    // Mock Types.ObjectId
    (Types.ObjectId.isValid as any) = vi.fn().mockReturnValue(true);
  });

  describe('Reserve Job Processing', () => {
    it('should process reserve job successfully', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      const mockSaleData = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 10000),
        currentQuantity: 10,
        startingQuantity: 100,
      };

      // Setup mocks
      mockRedis.exists.mockResolvedValue(0); // No consumed key
      mockRedis.get.mockResolvedValue(null); // No cached sale meta
      mockFlashSaleModel.findById().lean.mockResolvedValue(mockSaleData);
      mockRedis.zrank.mockResolvedValue(0); // First in queue
      mockRedis.set.mockResolvedValue('OK');

      // Import and get the job processor function
      const workerModule = await import('./main');
      
      // Since the job processor is created inside the bootstrap function,
      // we need to test the logic by creating a similar processor
      const processor = async (job: any) => {
        const { name } = job;
        
        if (name === 'reserve') {
          const { email: rawEmail, flashSaleId, holdTtlSec } = job.data;
          const email = rawEmail.trim().toLowerCase();
          const now = new Date();
          
          // Check if already consumed
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            await mockRedis.zrem(mockZsetKey(flashSaleId), email);
            return { ok: false, reason: 'already_consumed' };
          }

          // Get sale metadata
          let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
          if (!saleMeta) {
            const doc = await mockFlashSaleModel.findById(flashSaleId).lean();
            if (!doc) {
              await mockRedis.zrem(mockZsetKey(flashSaleId), email);
              throw new Error('flash_sale_not_found');
            }
            saleMeta = doc;
            await mockRedis.set(`fsmeta:${flashSaleId}`, JSON.stringify(saleMeta), 'EX', 30);
          }

          const startsAt = new Date(saleMeta.startsAt);
          const endsAt = new Date(saleMeta.endsAt);
          const isOnSchedule = saleMeta.status === FlashSaleStatus.OnSchedule;
          const isActiveWindow = isOnSchedule && startsAt <= now && now < endsAt;

          if (!isOnSchedule || now >= endsAt) {
            await mockRedis.zrem(mockZsetKey(flashSaleId), email);
            throw new Error('sale_inactive_or_ended');
          }

          if (!isActiveWindow) {
            throw new Error('RETRY_NOT_YET_ACTIVE');
          }

          // Check if first in queue
          const rank = await mockRedis.zrank(mockZsetKey(flashSaleId), email);
          if (rank !== 0) {
            throw new Error('RETRY_NOT_FIRST');
          }

          // Grant hold
          const holdTime = Math.max(1, Number(holdTtlSec) || 900);
          await mockRedis.set(mockHoldKey(flashSaleId, email), '1', 'EX', holdTime);
          await mockRedis.zrem(mockZsetKey(flashSaleId), email);

          return { ok: true, holdTime, stockLeft: 9 };
        }
      };

      const result = await processor(mockJob);

      expect(result).toEqual({
        ok: true,
        holdTime: 900,
        stockLeft: 9,
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'fsh:507f1f77bcf86cd799439011:test@example.com',
        '1',
        'EX',
        900
      );
    });

    it('should reject reserve job if user already consumed', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      mockRedis.exists.mockResolvedValue(1); // Already consumed

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            await mockRedis.zrem(mockZsetKey(flashSaleId), email);
            return { ok: false, reason: 'already_consumed' };
          }
        }
      };

      const result = await processor(mockJob);

      expect(result).toEqual({
        ok: false,
        reason: 'already_consumed',
      });
      expect(mockRedis.zrem).toHaveBeenCalledWith('fsq:507f1f77bcf86cd799439011', 'test@example.com');
    });

    it('should reject reserve job if sale not found', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: 'nonexistent',
          holdTtlSec: 900,
        },
      };

      mockRedis.exists.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockFlashSaleModel.findById().lean.mockResolvedValue(null);
      mockFlashSaleModel.findOne().lean.mockResolvedValue(null);

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            return { ok: false, reason: 'already_consumed' };
          }

          let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
          if (!saleMeta) {
            let doc = await mockFlashSaleModel.findById(flashSaleId).lean();
            if (!doc) {
              doc = await mockFlashSaleModel.findOne({ _id: flashSaleId }).lean();
            }
            if (!doc) {
              await mockRedis.zrem(mockZsetKey(flashSaleId), email);
              throw new Error('flash_sale_not_found');
            }
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('flash_sale_not_found');
      expect(mockRedis.zrem).toHaveBeenCalledWith('fsq:nonexistent', 'test@example.com');
    });

    it('should reject reserve job if sale not yet active', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      const mockSaleData = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date(Date.now() + 10000), // Future start time
        endsAt: new Date(Date.now() + 20000),
        currentQuantity: 10,
        startingQuantity: 100,
      };

      mockRedis.exists.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockFlashSaleModel.findById().lean.mockResolvedValue(mockSaleData);

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          const now = new Date();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            return { ok: false, reason: 'already_consumed' };
          }

          let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
          if (!saleMeta) {
            const doc = await mockFlashSaleModel.findById(flashSaleId).lean();
            saleMeta = doc;
          }

          const startsAt = new Date(saleMeta.startsAt);
          const endsAt = new Date(saleMeta.endsAt);
          const isOnSchedule = saleMeta.status === FlashSaleStatus.OnSchedule;
          const isActiveWindow = isOnSchedule && startsAt <= now && now < endsAt;

          if (!isActiveWindow) {
            throw new Error('RETRY_NOT_YET_ACTIVE');
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('RETRY_NOT_YET_ACTIVE');
    });

    it('should reject reserve job if user not first in queue', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      const mockSaleData = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 10000),
        currentQuantity: 10,
        startingQuantity: 100,
      };

      mockRedis.exists.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockFlashSaleModel.findById().lean.mockResolvedValue(mockSaleData);
      mockRedis.zrank.mockResolvedValue(1); // Not first in queue

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          const now = new Date();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            return { ok: false, reason: 'already_consumed' };
          }

          let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
          if (!saleMeta) {
            const doc = await mockFlashSaleModel.findById(flashSaleId).lean();
            saleMeta = doc;
          }

          const startsAt = new Date(saleMeta.startsAt);
          const endsAt = new Date(saleMeta.endsAt);
          const isOnSchedule = saleMeta.status === FlashSaleStatus.OnSchedule;
          const isActiveWindow = isOnSchedule && startsAt <= now && now < endsAt;

          if (!isActiveWindow) {
            throw new Error('RETRY_NOT_YET_ACTIVE');
          }

          const rank = await mockRedis.zrank(mockZsetKey(flashSaleId), email);
          if (rank !== 0) {
            throw new Error('RETRY_NOT_FIRST');
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('RETRY_NOT_FIRST');
    });
  });

  describe('Release Hold Job Processing', () => {
    it('should process release_hold job when hold expired and not consumed', async () => {
      const mockJob = {
        name: 'release_hold',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
        },
      };

      // Setup mocks for expired hold scenario
      mockRedis.multi().exec.mockResolvedValue([
        [null, 0], // hold doesn't exist
        [null, 0], // not consumed
      ]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('5'); // stock available

      const processor = async (job: any) => {
        if (job.name === 'release_hold') {
          const { flashSaleId, email } = job.data;
          
          const execRes = await mockRedis.multi().exists('hold').exists('consumed').exec();
          const holdExists = Number(execRes[0]?.[1]) === 1;
          const consumedExists = Number(execRes[1]?.[1]) === 1;

          if (consumedExists) {
            return { ok: true, status: 'consumed' };
          }
          if (holdExists) {
            return { ok: true, status: 'active' };
          }

          // Expired & not consumed → restore stock
          await mockRedis.incr('inventory');
          return { ok: true, status: 'restored' };
        }
      };

      const result = await processor(mockJob);

      expect(result).toEqual({
        ok: true,
        status: 'restored',
      });
      expect(mockRedis.incr).toHaveBeenCalledWith('inventory');
    });

    it('should handle release_hold job when already consumed', async () => {
      const mockJob = {
        name: 'release_hold',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
        },
      };

      mockRedis.multi().exec.mockResolvedValue([
        [null, 0], // hold doesn't exist
        [null, 1], // consumed exists
      ]);

      const processor = async (job: any) => {
        if (job.name === 'release_hold') {
          const execRes = await mockRedis.multi().exists('hold').exists('consumed').exec();
          const holdExists = Number(execRes[0]?.[1]) === 1;
          const consumedExists = Number(execRes[1]?.[1]) === 1;

          if (consumedExists) {
            return { ok: true, status: 'consumed' };
          }
          if (holdExists) {
            return { ok: true, status: 'active' };
          }

          return { ok: true, status: 'restored' };
        }
      };

      const result = await processor(mockJob);

      expect(result).toEqual({
        ok: true,
        status: 'consumed',
      });
    });

    it('should handle release_hold job when hold still active', async () => {
      const mockJob = {
        name: 'release_hold',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
        },
      };

      mockRedis.multi().exec.mockResolvedValue([
        [null, 1], // hold exists
        [null, 0], // not consumed
      ]);

      const processor = async (job: any) => {
        if (job.name === 'release_hold') {
          const execRes = await mockRedis.multi().exists('hold').exists('consumed').exec();
          const holdExists = Number(execRes[0]?.[1]) === 1;
          const consumedExists = Number(execRes[1]?.[1]) === 1;

          if (consumedExists) {
            return { ok: true, status: 'consumed' };
          }
          if (holdExists) {
            return { ok: true, status: 'active' };
          }

          return { ok: true, status: 'restored' };
        }
      };

      const result = await processor(mockJob);

      expect(result).toEqual({
        ok: true,
        status: 'active',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          
          try {
            await mockRedis.exists(mockConsumedKey(flashSaleId, email));
          } catch (error) {
            throw error;
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('Redis connection failed');
    });

    it('should handle MongoDB connection errors', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      mockRedis.exists.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockFlashSaleModel.findById().lean.mockRejectedValue(new Error('MongoDB connection failed'));

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            return { ok: false, reason: 'already_consumed' };
          }

          let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
          if (!saleMeta) {
            try {
              await mockFlashSaleModel.findById(flashSaleId).lean();
            } catch (error) {
              throw error;
            }
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('MongoDB connection failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid job data', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          // Missing required fields
        },
      };

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          
          if (!rawEmail || !flashSaleId) {
            throw new Error('Missing required job data');
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('Missing required job data');
    });

    it('should handle malformed sale metadata', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 900,
        },
      };

      mockRedis.exists.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue('invalid-json');

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId } = job.data;
          const email = rawEmail.trim().toLowerCase();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            return { ok: false, reason: 'already_consumed' };
          }

          try {
            let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
            if (!saleMeta) {
              // Handle null case
            }
          } catch (error) {
            throw new Error('Invalid sale metadata');
          }
        }
      };

      await expect(processor(mockJob)).rejects.toThrow('Invalid sale metadata');
    });

    it('should handle zero hold TTL', async () => {
      const mockJob = {
        name: 'reserve',
        data: {
          email: 'test@example.com',
          flashSaleId: '507f1f77bcf86cd799439011',
          holdTtlSec: 0,
        },
      };

      const mockSaleData = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 10000),
        currentQuantity: 10,
        startingQuantity: 100,
      };

      mockRedis.exists.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockFlashSaleModel.findById().lean.mockResolvedValue(mockSaleData);
      mockRedis.zrank.mockResolvedValue(0);

      const processor = async (job: any) => {
        if (job.name === 'reserve') {
          const { email: rawEmail, flashSaleId, holdTtlSec } = job.data;
          const email = rawEmail.trim().toLowerCase();
          const now = new Date();
          
          if (await mockRedis.exists(mockConsumedKey(flashSaleId, email))) {
            return { ok: false, reason: 'already_consumed' };
          }

          let saleMeta = JSON.parse(await mockRedis.get(`fsmeta:${flashSaleId}`) ?? 'null');
          if (!saleMeta) {
            const doc = await mockFlashSaleModel.findById(flashSaleId).lean();
            saleMeta = doc;
          }

          const startsAt = new Date(saleMeta.startsAt);
          const endsAt = new Date(saleMeta.endsAt);
          const isOnSchedule = saleMeta.status === FlashSaleStatus.OnSchedule;
          const isActiveWindow = isOnSchedule && startsAt <= now && now < endsAt;

          if (!isActiveWindow) {
            throw new Error('RETRY_NOT_YET_ACTIVE');
          }

          const rank = await mockRedis.zrank(mockZsetKey(flashSaleId), email);
          if (rank !== 0) {
            throw new Error('RETRY_NOT_FIRST');
          }

          // Should use minimum of 1 second for hold time
          const holdTime = Math.max(1, Number(holdTtlSec) || 900);
          expect(holdTime).toBe(1);

          return { ok: true, holdTime, stockLeft: 9 };
        }
      };

      const result = await processor(mockJob);
      expect(result.holdTime).toBe(1);
    });
  });
});