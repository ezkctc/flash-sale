import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const findByIdLean = vi.fn();
  const findOneLean = vi.fn();
  const findById = vi.fn(() => ({ lean: findByIdLean }));
  const findOne = vi.fn(() => ({ lean: findOneLean }));
  const zsetKey = vi.fn((saleId: string) => `fsq:${saleId}`);
  const holdKey = vi.fn(
    (saleId: string, email: string) => `fsh:${saleId}:${email}`
  );
  const consumedKey = vi.fn(
    (saleId: string, email: string) => `fshp:${saleId}:${email}`
  );
  const makeMulti = () => {
    const multi: any = {
      set: vi.fn().mockReturnThis(),
      zrem: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1],
      ]),
    };
    return multi;
  };
  const isValid = vi.fn().mockReturnValue(true);
  return {
    findByIdLean,
    findOneLean,
    findById,
    findOne,
    zsetKey,
    holdKey,
    consumedKey,
    makeMulti,
    isValid,
  };
});

vi.mock('@flash-sale/shared-types', () => ({
  FlashSaleStatus: { OnSchedule: 'OnSchedule', Cancelled: 'cancelled' },
  flashSaleMongoModel: { findById: hoisted.findById, findOne: hoisted.findOne },
}));

vi.mock('@flash-sale/shared-utils', () => ({
  zsetKey: hoisted.zsetKey,
  holdKey: hoisted.holdKey,
  consumedKey: hoisted.consumedKey,
}));

vi.mock('mongoose', () => {
  class ObjectId {
    id?: string;
    constructor(id?: string) {
      this.id = id;
    }
    static isValid = hoisted.isValid;
  }
  const Schema = vi.fn();
  const model = vi.fn();
  return { Schema, model, Types: { ObjectId } };
});

vi.mock('ioredis', () => {
  const Redis = vi.fn();
  return { Redis };
});

vi.mock('bullmq', () => {
  const Queue = vi.fn();
  const Worker = vi.fn();
  const QueueEvents = vi.fn();
  return { Queue, Worker, QueueEvents };
});

import { FlashSaleStatus } from '@flash-sale/shared-types';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';
import { createProcessors } from './main';

describe('Job Processor (reserve)', () => {
  let mockRedis: any;
  let mockQueue: any;
  let reserve: (job: any) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn(),
      exists: vi.fn(),
      zrem: vi.fn(),
      zrank: vi.fn(),
      incr: vi.fn(),
      decr: vi.fn(),
      multi: vi.fn().mockImplementation(() => hoisted.makeMulti()),
    };
    mockQueue = { add: vi.fn() };
    hoisted.findByIdLean.mockResolvedValue(null);
    hoisted.findOneLean.mockResolvedValue(null);
    const { reserveJobProcessor } = createProcessors(
      mockRedis,
      mockQueue as any
    );
    reserve = reserveJobProcessor as any;
  });

  it('processes reserve successfully (head-of-line, active, stock>0)', async () => {
    const mockJob = {
      name: 'reserve',
      data: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
        holdTtlSec: 900,
      },
    };
    const saleDoc = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 10_000),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    mockRedis.exists.mockResolvedValue(0);
    // 1) cache miss, 2) inventory read after NX init
    mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('100');

    hoisted.findByIdLean.mockResolvedValue(saleDoc);
    mockRedis.zrank.mockResolvedValue(0);

    const result = await reserve(mockJob);
    expect(result).toEqual({ ok: true, holdTime: 900, stockLeft: 99 });

    expect(holdKey).toHaveBeenCalledWith(
      mockJob.data.flashSaleId,
      mockJob.data.email
    );
    expect(zsetKey).toHaveBeenCalledWith(mockJob.data.flashSaleId);

    const multi = mockRedis.multi.mock.results[0].value;
    expect(multi.set).toHaveBeenCalledWith(
      `fsh:${mockJob.data.flashSaleId}:${mockJob.data.email}`,
      '1',
      'EX',
      900
    );
    expect(multi.zrem).toHaveBeenCalledWith(
      `fsq:${mockJob.data.flashSaleId}`,
      mockJob.data.email
    );
    expect(multi.exec).toHaveBeenCalled();

    expect(mockQueue.add).toHaveBeenCalledWith(
      'release_hold',
      { flashSaleId: mockJob.data.flashSaleId, email: mockJob.data.email },
      expect.objectContaining({
        delay: 900_000,
        jobId: `release:${mockJob.data.flashSaleId}:${mockJob.data.email}`,
        removeOnComplete: true,
        removeOnFail: true,
      })
    );
  });

  it('returns already_consumed and zrem from queue', async () => {
    const mockJob = {
      name: 'reserve',
      data: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
        holdTtlSec: 900,
      },
    };
    mockRedis.exists.mockResolvedValue(1);
    const result = await reserve(mockJob);
    expect(result).toEqual({ ok: false, reason: 'already_consumed' });
    expect(mockRedis.zrem).toHaveBeenCalledWith(
      `fsq:${mockJob.data.flashSaleId}`,
      mockJob.data.email
    );
  });

  it('throws if sale not found (after cache miss)', async () => {
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
    hoisted.findByIdLean.mockResolvedValue(null);
    await expect(reserve(mockJob)).rejects.toThrow('flash_sale_not_found');
    expect(mockRedis.zrem).toHaveBeenCalledWith(
      `fsq:${mockJob.data.flashSaleId}`,
      mockJob.data.email
    );
  });

  it('throws RETRY_NOT_YET_ACTIVE when sale not yet active', async () => {
    const mockJob = {
      name: 'reserve',
      data: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
        holdTtlSec: 900,
      },
    };
    const saleDoc = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(Date.now() + 10_000),
      endsAt: new Date(Date.now() + 20_000),
      currentQuantity: 10,
      startingQuantity: 100,
    };
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.get.mockResolvedValue(null);
    hoisted.findByIdLean.mockResolvedValue(saleDoc);
    await expect(reserve(mockJob)).rejects.toThrow('RETRY_NOT_YET_ACTIVE');
  });

  it('throws RETRY_NOT_FIRST when user rank !== 0', async () => {
    const mockJob = {
      name: 'reserve',
      data: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
        holdTtlSec: 900,
      },
    };
    const saleDoc = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 10_000),
      currentQuantity: 10,
      startingQuantity: 100,
    };
    mockRedis.exists.mockResolvedValue(0);
    mockRedis.get.mockResolvedValue(null);
    hoisted.findByIdLean.mockResolvedValue(saleDoc);
    mockRedis.zrank.mockResolvedValue(1);
    await expect(reserve(mockJob)).rejects.toThrow('RETRY_NOT_FIRST');
  });

  it('propagates Redis errors', async () => {
    const mockJob = {
      name: 'reserve',
      data: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
        holdTtlSec: 900,
      },
    };
    mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));
    await expect(reserve(mockJob)).rejects.toThrow('Redis connection failed');
  });

  it('propagates Mongo errors', async () => {
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
    hoisted.findByIdLean.mockRejectedValue(
      new Error('MongoDB connection failed')
    );
    await expect(reserve(mockJob)).rejects.toThrow('MongoDB connection failed');
  });

  it('invalid job data → throws', async () => {
    const mockJob = { name: 'reserve', data: {} };
    await expect(reserve(mockJob as any)).rejects.toThrow(
      'Missing required job data'
    );
  });

  it('malformed cached sale metadata → throws', async () => {
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
    await expect(reserve(mockJob)).rejects.toThrow('Invalid sale metadata');
  });
});
