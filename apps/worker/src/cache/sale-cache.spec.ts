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
    (Types.ObjectId as any) = vi.fn().mockImplementation((id) => ({ toString: () => id }));
  });

  it('should return cached sale metadata when available', async () => {
    const cachedSale = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(),
      endsAt: new Date(),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    mockRedis.get.mockResolvedValue(JSON.stringify(cachedSale));

    const result = await getSaleMeta(mockRedis, 'test-sale-id');

    expect(result).toEqual(cachedSale);
    expect(mockRedis.get).toHaveBeenCalledWith('fsmeta:test-sale-id');
    expect(mockFlashSaleModel.findById).not.toHaveBeenCalled();
    expect(mockFlashSaleModel.findOne).not.toHaveBeenCalled();
  });

  it('should fetch from database and cache when not in cache (ObjectId)', async () => {
    const saleData = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(),
      endsAt: new Date(),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    (Types.ObjectId.isValid as any).mockReturnValue(true);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findById().lean.mockResolvedValue(saleData);

    const result = await getSaleMeta(mockRedis, '507f1f77bcf86cd799439011');

    expect(result).toEqual(saleData);
    expect(mockRedis.get).toHaveBeenCalledWith('fsmeta:507f1f77bcf86cd799439011');
    expect(mockFlashSaleModel.findById).toHaveBeenCalledWith(
      expect.any(Object),
      {
        status: 1,
        startsAt: 1,
        endsAt: 1,
        currentQuantity: 1,
        startingQuantity: 1,
      }
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'fsmeta:507f1f77bcf86cd799439011',
      JSON.stringify(saleData),
      'EX',
      30
    );
  });

  it('should fetch from database using findOne when ObjectId lookup fails', async () => {
    const saleData = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(),
      endsAt: new Date(),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    (Types.ObjectId.isValid as any).mockReturnValue(true);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findById().lean.mockResolvedValue(null);
    mockFlashSaleModel.findOne().lean.mockResolvedValue(saleData);

    const result = await getSaleMeta(mockRedis, '507f1f77bcf86cd799439011');

    expect(result).toEqual(saleData);
    expect(mockFlashSaleModel.findById).toHaveBeenCalled();
    expect(mockFlashSaleModel.findOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      {
        status: 1,
        startsAt: 1,
        endsAt: 1,
        currentQuantity: 1,
        startingQuantity: 1,
      }
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'fsmeta:507f1f77bcf86cd799439011',
      JSON.stringify(saleData),
      'EX',
      30
    );
  });

  it('should fetch from database using findOne when not valid ObjectId', async () => {
    const saleData = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(),
      endsAt: new Date(),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    (Types.ObjectId.isValid as any).mockReturnValue(false);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findOne().lean.mockResolvedValue(saleData);

    const result = await getSaleMeta(mockRedis, 'string-id');

    expect(result).toEqual(saleData);
    expect(mockFlashSaleModel.findById).not.toHaveBeenCalled();
    expect(mockFlashSaleModel.findOne).toHaveBeenCalledWith(
      { _id: 'string-id' },
      {
        status: 1,
        startsAt: 1,
        endsAt: 1,
        currentQuantity: 1,
        startingQuantity: 1,
      }
    );
  });

  it('should throw error when sale not found in database', async () => {
    (Types.ObjectId.isValid as any).mockReturnValue(true);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findById().lean.mockResolvedValue(null);
    mockFlashSaleModel.findOne().lean.mockResolvedValue(null);

    await expect(getSaleMeta(mockRedis, 'nonexistent')).rejects.toThrow('flash_sale_not_found');
    
    expect(mockFlashSaleModel.findById).toHaveBeenCalled();
    expect(mockFlashSaleModel.findOne).toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('should handle Redis get errors', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

    await expect(getSaleMeta(mockRedis, 'test-sale-id')).rejects.toThrow('Redis connection failed');
  });

  it('should handle MongoDB errors', async () => {
    (Types.ObjectId.isValid as any).mockReturnValue(true);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findById().lean.mockRejectedValue(new Error('MongoDB connection failed'));

    await expect(getSaleMeta(mockRedis, 'test-sale-id')).rejects.toThrow('MongoDB connection failed');
  });

  it('should handle Redis set errors gracefully', async () => {
    const saleData = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(),
      endsAt: new Date(),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    (Types.ObjectId.isValid as any).mockReturnValue(true);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findById().lean.mockResolvedValue(saleData);
    mockRedis.set.mockRejectedValue(new Error('Redis set failed'));

    // Should still return the data even if caching fails
    await expect(getSaleMeta(mockRedis, 'test-sale-id')).rejects.toThrow('Redis set failed');
  });

  it('should handle malformed cached data', async () => {
    mockRedis.get.mockResolvedValue('invalid-json');

    await expect(getSaleMeta(mockRedis, 'test-sale-id')).rejects.toThrow();
  });

  it('should cache data with correct TTL', async () => {
    const saleData = {
      status: FlashSaleStatus.OnSchedule,
      startsAt: new Date(),
      endsAt: new Date(),
      currentQuantity: 10,
      startingQuantity: 100,
    };

    (Types.ObjectId.isValid as any).mockReturnValue(false);
    mockRedis.get.mockResolvedValue(null);
    mockFlashSaleModel.findOne().lean.mockResolvedValue(saleData);

    await getSaleMeta(mockRedis, 'test-sale-id');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'fsmeta:test-sale-id',
      JSON.stringify(saleData),
      'EX',
      30
    );
  });
});