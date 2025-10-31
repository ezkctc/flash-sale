import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';
import { flashSaleMongoModel, FlashSaleStatus } from '@flash-sale/shared-types';
import { Types } from 'mongoose';

// Mock dependencies
vi.mock('ioredis');
vi.mock('@flash-sale/shared-types');
vi.mock('mongoose');

// Sale cache utility functions (extracted from main.ts logic)
const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`;

async function getSaleMeta(redis: Redis, flashSaleId: string) {
  let saleMeta = JSON.parse(
    (await redis.get(saleCacheKey(flashSaleId))) ?? 'null'
  );

  if (!saleMeta) {
    let doc = null;
    if (Types.ObjectId.isValid(flashSaleId)) {
      doc = await flashSaleMongoModel
        .findById(new Types.ObjectId(flashSaleId), {
          status: 1,
          startsAt: 1,
          endsAt: 1,
          currentQuantity: 1,
          startingQuantity: 1,
        })
        .lean();
    }

    if (!doc) {
      doc = await flashSaleMongoModel
        .findOne(
          { _id: flashSaleId },
          {
            status: 1,
            startsAt: 1,
            endsAt: 1,
            currentQuantity: 1,
            startingQuantity: 1,
          }
        )
        .lean();
    }

    if (!doc) {
      throw new Error('flash_sale_not_found');
    }

    saleMeta = doc;
    await redis.set(
      saleCacheKey(flashSaleId),
      JSON.stringify(saleMeta),
      'EX',
      30
    );
  }

  return saleMeta;
}

describe('Sale Cache', () => {
  let mockRedis: any;
  let mockFlashSaleModel: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);

    mockFlashSaleModel = {
      findById: vi.fn().mockReturnValue({
        lean: vi.fn(),
      }),
      findOne: vi.fn().mockReturnValue({
        lean: vi.fn(),
      }),
    };
    (flashSaleMongoModel as any) = mockFlashSaleModel;

    (Types.ObjectId.isValid as any) = vi.fn();
    (Types.ObjectId as any) = vi
      .fn()
      .mockImplementation((id) => ({ toString: () => id }));
  });

  it('should handle Redis get errors', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

    await expect(getSaleMeta(mockRedis, 'test-sale-id')).rejects.toThrow(
      'Redis connection failed'
    );
  });

  it('should handle malformed cached data', async () => {
    mockRedis.get.mockResolvedValue('invalid-json');

    await expect(getSaleMeta(mockRedis, 'test-sale-id')).rejects.toThrow();
  });
});
