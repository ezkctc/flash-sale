import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';

// Mock Redis
vi.mock('ioredis');

// Inventory management utilities (extracted from main.ts logic)
const invKey = (saleId: string) => `fsinv:${saleId}`;

async function initializeInventory(redis: Redis, saleId: string, initialQuantity: number) {
  return await redis.set(invKey(saleId), String(initialQuantity), 'NX');
}

async function getCurrentStock(redis: Redis, saleId: string): Promise<number> {
  const stock = await redis.get(invKey(saleId));
  return parseInt(stock ?? '0', 10);
}

async function decrementStock(redis: Redis, saleId: string): Promise<number> {
  return await redis.decr(invKey(saleId));
}

async function incrementStock(redis: Redis, saleId: string): Promise<number> {
  return await redis.incr(invKey(saleId));
}

describe('Inventory Manager', () => {
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedis = {
      set: vi.fn(),
      get: vi.fn(),
      incr: vi.fn(),
      decr: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);
  });

  describe('initializeInventory', () => {
    it('should initialize inventory with correct value', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await initializeInventory(mockRedis, 'sale-123', 100);

      expect(result).toBe('OK');
      expect(mockRedis.set).toHaveBeenCalledWith('fsinv:sale-123', '100', 'NX');
    });

    it('should not overwrite existing inventory', async () => {
      mockRedis.set.mockResolvedValue(null); // NX failed, key exists

      const result = await initializeInventory(mockRedis, 'sale-123', 100);

      expect(result).toBeNull();
      expect(mockRedis.set).toHaveBeenCalledWith('fsinv:sale-123', '100', 'NX');
    });

    it('should handle Redis errors', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      await expect(initializeInventory(mockRedis, 'sale-123', 100)).rejects.toThrow('Redis error');
    });
  });

  describe('getCurrentStock', () => {
    it('should return current stock value', async () => {
      mockRedis.get.mockResolvedValue('50');

      const result = await getCurrentStock(mockRedis, 'sale-123');

      expect(result).toBe(50);
      expect(mockRedis.get).toHaveBeenCalledWith('fsinv:sale-123');
    });

    it('should return 0 when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getCurrentStock(mockRedis, 'sale-123');

      expect(result).toBe(0);
    });

    it('should handle non-numeric values', async () => {
      mockRedis.get.mockResolvedValue('invalid');

      const result = await getCurrentStock(mockRedis, 'sale-123');

      expect(result).toBeNaN();
    });

    it('should handle Redis errors', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      await expect(getCurrentStock(mockRedis, 'sale-123')).rejects.toThrow('Redis error');
    });
  });

  describe('decrementStock', () => {
    it('should decrement stock and return new value', async () => {
      mockRedis.decr.mockResolvedValue(49);

      const result = await decrementStock(mockRedis, 'sale-123');

      expect(result).toBe(49);
      expect(mockRedis.decr).toHaveBeenCalledWith('fsinv:sale-123');
    });

    it('should handle negative values', async () => {
      mockRedis.decr.mockResolvedValue(-1);

      const result = await decrementStock(mockRedis, 'sale-123');

      expect(result).toBe(-1);
    });

    it('should handle Redis errors', async () => {
      mockRedis.decr.mockRejectedValue(new Error('Redis error'));

      await expect(decrementStock(mockRedis, 'sale-123')).rejects.toThrow('Redis error');
    });
  });

  describe('incrementStock', () => {
    it('should increment stock and return new value', async () => {
      mockRedis.incr.mockResolvedValue(51);

      const result = await incrementStock(mockRedis, 'sale-123');

      expect(result).toBe(51);
      expect(mockRedis.incr).toHaveBeenCalledWith('fsinv:sale-123');
    });

    it('should handle Redis errors', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis error'));

      await expect(incrementStock(mockRedis, 'sale-123')).rejects.toThrow('Redis error');
    });
  });

  describe('Stock Operations Integration', () => {
    it('should handle complete stock lifecycle', async () => {
      // Initialize
      mockRedis.set.mockResolvedValue('OK');
      await initializeInventory(mockRedis, 'sale-123', 100);

      // Check initial stock
      mockRedis.get.mockResolvedValue('100');
      let stock = await getCurrentStock(mockRedis, 'sale-123');
      expect(stock).toBe(100);

      // Decrement stock
      mockRedis.decr.mockResolvedValue(99);
      const newStock = await decrementStock(mockRedis, 'sale-123');
      expect(newStock).toBe(99);

      // Increment stock (restore)
      mockRedis.incr.mockResolvedValue(100);
      const restoredStock = await incrementStock(mockRedis, 'sale-123');
      expect(restoredStock).toBe(100);
    });

    it('should handle concurrent operations', async () => {
      // Simulate multiple decrements
      mockRedis.decr
        .mockResolvedValueOnce(99)
        .mockResolvedValueOnce(98)
        .mockResolvedValueOnce(97);

      const results = await Promise.all([
        decrementStock(mockRedis, 'sale-123'),
        decrementStock(mockRedis, 'sale-123'),
        decrementStock(mockRedis, 'sale-123'),
      ]);

      expect(results).toEqual([99, 98, 97]);
      expect(mockRedis.decr).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero inventory', async () => {
      mockRedis.get.mockResolvedValue('0');

      const stock = await getCurrentStock(mockRedis, 'sale-123');
      expect(stock).toBe(0);
    });

    it('should handle large inventory numbers', async () => {
      const largeNumber = 999999999;
      mockRedis.get.mockResolvedValue(String(largeNumber));

      const stock = await getCurrentStock(mockRedis, 'sale-123');
      expect(stock).toBe(largeNumber);
    });

    it('should handle floating point values', async () => {
      mockRedis.get.mockResolvedValue('50.5');

      const stock = await getCurrentStock(mockRedis, 'sale-123');
      expect(stock).toBe(50); // parseInt truncates
    });

    it('should handle empty string', async () => {
      mockRedis.get.mockResolvedValue('');

      const stock = await getCurrentStock(mockRedis, 'sale-123');
      expect(stock).toBeNaN();
    });
  });
});