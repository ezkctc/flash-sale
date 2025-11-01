import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

const h = vi.hoisted(() => {
  const mockRedis = { get: vi.fn(), set: vi.fn() };
  const mockFlashSaleModel = {
    findById: vi.fn().mockReturnValue({ lean: vi.fn() }),
    findOne: vi.fn().mockReturnValue({ lean: vi.fn() }),
  };
  const mockIsValid = vi.fn();
  const MockObjectId: any = vi.fn((id: string) => ({ toString: () => id }));
  MockObjectId.isValid = mockIsValid;
  return { mockRedis, mockFlashSaleModel, mockIsValid, MockObjectId };
});

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => h.mockRedis),
  default: vi.fn().mockImplementation(() => h.mockRedis),
}));

vi.mock('@flash-sale/shared-types', () => ({
  flashSaleMongoModel: h.mockFlashSaleModel,
  FlashSaleStatus: {},
}));

vi.mock('mongoose', () => ({
  Types: { ObjectId: h.MockObjectId },
}));

const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`;

async function getSaleMeta(redis: Redis, flashSaleId: string) {
  const cached = await redis.get(saleCacheKey(flashSaleId));
  let saleMeta = JSON.parse(cached ?? 'null');
  if (!saleMeta) {
    let doc: any = null;
    if (Types.ObjectId.isValid(flashSaleId)) {
      doc = await flashSaleMongoModel
        .findById(new (Types.ObjectId as any)(flashSaleId), {
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
    if (!doc) throw new Error('flash_sale_not_found');
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
  beforeEach(() => {
    vi.clearAllMocks();
    h.mockRedis.get.mockReset();
    h.mockRedis.set.mockReset();
    h.mockFlashSaleModel.findById
      .mockReset()
      .mockReturnValue({ lean: vi.fn() });
    h.mockFlashSaleModel.findOne.mockReset().mockReturnValue({ lean: vi.fn() });
    h.mockIsValid.mockReset();
    h.MockObjectId.mockClear();
  });

  it('handles Redis get errors', async () => {
    h.mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
    await expect(
      getSaleMeta(h.mockRedis as unknown as Redis, 'x')
    ).rejects.toThrow('Redis connection failed');
  });

  it('handles malformed cached data', async () => {
    h.mockRedis.get.mockResolvedValue('invalid-json');
    await expect(
      getSaleMeta(h.mockRedis as unknown as Redis, 'x')
    ).rejects.toThrow();
  });

  it('loads from DB and caches on miss when ObjectId is valid', async () => {
    h.mockRedis.get.mockResolvedValue(null);
    h.mockIsValid.mockReturnValue(true);
    const leanResult = {
      status: 'ACTIVE',
      currentQuantity: 10,
      startingQuantity: 10,
    };
    const leanFn = vi.fn().mockResolvedValue(leanResult);
    h.mockFlashSaleModel.findById.mockReturnValue({ lean: leanFn });
    const id = '656f00000000000000000001';
    const result = await getSaleMeta(h.mockRedis as unknown as Redis, id);
    expect(h.mockIsValid).toHaveBeenCalledWith(id);
    expect(h.mockFlashSaleModel.findById).toHaveBeenCalled();
    expect(h.mockRedis.set).toHaveBeenCalledWith(
      `fsmeta:${id}`,
      JSON.stringify(leanResult),
      'EX',
      30
    );
    expect(result).toEqual(leanResult);
  });
});
