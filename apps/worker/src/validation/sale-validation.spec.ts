import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlashSaleStatus } from '@flash-sale/shared-types';

// Define the expected structure for type safety
interface SaleMeta {
  status: FlashSaleStatus;
  startsAt: Date | string;
  endsAt: Date | string;
  currentQuantity?: number | string;
  startingQuantity?: number | string;
}

/**
 * Validates the time window status of a flash sale.
 * @param saleMeta - The sale metadata containing timing and status.
 * @param now - The current time used for comparison (defaults to new Date()).
 * @returns An object detailing the time-based status.
 */
function validateSaleWindow(saleMeta: SaleMeta, now: Date = new Date()) {
  const startsAt = new Date(saleMeta.startsAt);
  const endsAt = new Date(saleMeta.endsAt);
  const isOnSchedule = saleMeta.status === FlashSaleStatus.OnSchedule;
  // A sale is active if it's OnSchedule, starts at or before now, and ends strictly after now.
  const isActiveWindow = isOnSchedule && startsAt <= now && now < endsAt;

  return {
    isOnSchedule,
    isActiveWindow,
    startsAt,
    endsAt,
    isExpired: now >= endsAt,
    isNotYetStarted: now < startsAt,
  };
}

/**
 * Validates the stock and quantity status of a flash sale.
 * @param saleMeta - The sale metadata containing current and starting quantities.
 * @returns An object detailing the stock-based status.
 */
function validateSaleStock(saleMeta: SaleMeta) {
  // Safely convert potentially missing or string quantities to numbers
  const currentQuantity = Number(saleMeta.currentQuantity ?? 0);
  const startingQuantity = Number(saleMeta.startingQuantity ?? 0);

  const soldFraction =
    startingQuantity > 0
      ? (startingQuantity - currentQuantity) / startingQuantity
      : 0;

  return {
    currentQuantity,
    startingQuantity,
    hasStock: currentQuantity > 0,
    isSoldOut: currentQuantity <= 0,
    // Ensure soldCount never goes below zero, even if currentQuantity > startingQuantity
    soldCount: Math.max(0, startingQuantity - currentQuantity),
    soldPercentage: soldFraction,
  };
}

describe('Sale Validation', () => {
  describe('validateSaleWindow', () => {
    it('should validate active sale window correctly', () => {
      const now = new Date('2025-01-15T12:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result).toEqual({
        isOnSchedule: true,
        isActiveWindow: true,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        isExpired: false,
        isNotYetStarted: false,
      });
    });

    it('should validate sale not yet started', () => {
      const now = new Date('2025-01-15T09:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result).toEqual({
        isOnSchedule: true,
        isActiveWindow: false,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        isExpired: false,
        isNotYetStarted: true,
      });
    });

    it('should validate expired sale', () => {
      const now = new Date('2025-01-15T15:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result).toEqual({
        isOnSchedule: true,
        isActiveWindow: false,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        isExpired: true,
        isNotYetStarted: false,
      });
    });

    it('should validate cancelled sale', () => {
      const now = new Date('2025-01-15T12:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.Cancelled,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result).toEqual({
        isOnSchedule: false,
        isActiveWindow: false,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        isExpired: false,
        isNotYetStarted: false,
      });
    });

    it('should handle edge case at exact start time', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result.isActiveWindow).toBe(true);
      expect(result.isNotYetStarted).toBe(false);
    });

    it('should handle edge case at exact end time', () => {
      const now = new Date('2025-01-15T14:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result.isActiveWindow).toBe(false);
      expect(result.isExpired).toBe(true);
    });

    it('should use current time when not provided', () => {
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 1000),
      };

      const result = validateSaleWindow(saleMeta);

      expect(result.isActiveWindow).toBe(true);
    });

    it('should handle string date formats', () => {
      const now = new Date('2025-01-15T12:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: '2025-01-15T10:00:00Z',
        endsAt: '2025-01-15T14:00:00Z',
      };

      const result = validateSaleWindow(saleMeta, now);

      expect(result.isActiveWindow).toBe(true);
      expect(result.startsAt).toEqual(new Date('2025-01-15T10:00:00Z'));
      expect(result.endsAt).toEqual(new Date('2025-01-15T14:00:00Z'));
    });
  });

  describe('validateSaleStock', () => {
    it('should validate sale with available stock', () => {
      const saleMeta: SaleMeta = {
        currentQuantity: 75,
        startingQuantity: 100,
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: 75,
        startingQuantity: 100,
        hasStock: true,
        isSoldOut: false,
        soldCount: 25,
        soldPercentage: 0.25,
      });
    });

    it('should validate sold out sale', () => {
      const saleMeta: SaleMeta = {
        currentQuantity: 0,
        startingQuantity: 100,
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: 0,
        startingQuantity: 100,
        hasStock: false,
        isSoldOut: true,
        soldCount: 100,
        soldPercentage: 1,
      });
    });

    it('should handle negative current quantity (oversold)', () => {
      const saleMeta: SaleMeta = {
        currentQuantity: -5,
        startingQuantity: 100,
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: -5,
        startingQuantity: 100,
        hasStock: false,
        isSoldOut: true,
        soldCount: 105,
        soldPercentage: 1.05,
      });
    });

    it('should handle missing quantity fields', () => {
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: 0,
        startingQuantity: 0,
        hasStock: false,
        isSoldOut: true,
        soldCount: 0,
        soldPercentage: 0,
      });
    });

    it('should handle string quantity values', () => {
      const saleMeta: SaleMeta = {
        currentQuantity: '50',
        startingQuantity: '100',
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: 50,
        startingQuantity: 100,
        hasStock: true,
        isSoldOut: false,
        soldCount: 50,
        soldPercentage: 0.5,
      });
    });

    it('should handle zero starting quantity', () => {
      const saleMeta: SaleMeta = {
        currentQuantity: 0,
        startingQuantity: 0,
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: 0,
        startingQuantity: 0,
        hasStock: false,
        isSoldOut: true,
        soldCount: 0,
        soldPercentage: 0,
      });
    });

    it('should handle current quantity greater than starting quantity', () => {
      const saleMeta: SaleMeta = {
        currentQuantity: 150,
        startingQuantity: 100,
        status: FlashSaleStatus.OnSchedule,
        startsAt: '',
        endsAt: '',
      };

      const result = validateSaleStock(saleMeta);

      expect(result).toEqual({
        currentQuantity: 150,
        startingQuantity: 100,
        hasStock: true,
        isSoldOut: false,
        soldCount: 0, // Math.max prevents negative
        soldPercentage: -0.5, // Sold percentage tracks the mathematical reduction, allowing for negative
      });
    });
  });

  describe('Integration Tests', () => {
    it('should validate complete sale state', () => {
      const now = new Date('2025-01-15T12:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        currentQuantity: 25,
        startingQuantity: 100,
      };

      const windowValidation = validateSaleWindow(saleMeta, now);
      const stockValidation = validateSaleStock(saleMeta);

      expect(windowValidation.isActiveWindow).toBe(true);
      expect(stockValidation.hasStock).toBe(true);
      expect(stockValidation.soldPercentage).toBe(0.75);
    });

    it('should identify sale that is active but sold out', () => {
      const now = new Date('2025-01-15T12:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        currentQuantity: 0,
        startingQuantity: 100,
      };

      const windowValidation = validateSaleWindow(saleMeta, now);
      const stockValidation = validateSaleStock(saleMeta);

      expect(windowValidation.isActiveWindow).toBe(true);
      expect(stockValidation.isSoldOut).toBe(true);
    });

    it('should identify sale that has stock but is expired', () => {
      const now = new Date('2025-01-15T15:00:00Z');
      const saleMeta: SaleMeta = {
        status: FlashSaleStatus.OnSchedule,
        startsAt: new Date('2025-01-15T10:00:00Z'),
        endsAt: new Date('2025-01-15T14:00:00Z'),
        currentQuantity: 50,
        startingQuantity: 100,
      };

      const windowValidation = validateSaleWindow(saleMeta, now);
      const stockValidation = validateSaleStock(saleMeta);

      expect(windowValidation.isExpired).toBe(true);
      expect(stockValidation.hasStock).toBe(true);
    });
  });
});
