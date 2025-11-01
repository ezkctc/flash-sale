// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  listFlashSales,
  getFlashSale,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
} from './flash-sales';
import { mockFlashSale, mockFlashSales } from '../../../src/test/fixtures';
import {
  setupLocalStorage,
  mockSuccessResponse,
  mockErrorResponse,
} from '../../../src/test/test-utils';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, apiFetch: vi.fn() };
});
import * as apiModule from './api';

describe('Flash Sales Service', () => {
  let mockApiFetch: ReturnType<typeof vi.fn>;
  let mockStorage: ReturnType<typeof setupLocalStorage>;

  beforeEach(() => {
    // This line now runs successfully because the environment is jsdom
    mockStorage = setupLocalStorage();
    mockStorage.setItem('auth_token', 'test-token');

    mockApiFetch = (apiModule as any).apiFetch as any;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listFlashSales', () => {
    it('should fetch list of flash sales', async () => {
      const mockResponse = { items: mockFlashSales, total: 2 };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await listFlashSales();

      expect(mockApiFetch).toHaveBeenCalledWith('/flash-sales');
      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(2);
    });

    it('should handle empty list', async () => {
      const mockResponse = { items: [], total: 0 };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await listFlashSales();

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle API errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      await expect(listFlashSales()).rejects.toThrow('Network error');
    });
  });

  describe('getFlashSale', () => {
    it('should fetch single flash sale by ID', async () => {
      mockApiFetch.mockResolvedValue(mockFlashSale);

      const result = await getFlashSale('507f1f77bcf86cd799439011');

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/flash-sales/507f1f77bcf86cd799439011'
      );
      expect(result).toEqual(mockFlashSale);
    });

    it('should handle non-existent flash sale', async () => {
      mockApiFetch.mockRejectedValue(new Error('Not found'));

      await expect(getFlashSale('invalid-id')).rejects.toThrow('Not found');
    });

    it('should handle API errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Server error'));

      await expect(getFlashSale('507f1f77bcf86cd799439011')).rejects.toThrow(
        'Server error'
      );
    });
  });

  describe('createFlashSale', () => {
    it('should create new flash sale', async () => {
      const newSale = {
        name: 'New Sale',
        description: 'Test',
        startsAt: new Date('2025-12-01T10:00:00Z'),
        endsAt: new Date('2025-12-01T12:00:00Z'),
        startingQuantity: 100,
        currentQuantity: 100,
      };
      const mockResponse = { id: '507f1f77bcf86cd799439015' };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await createFlashSale(newSale as any);

      expect(mockApiFetch).toHaveBeenCalledWith('/flash-sales', {
        method: 'POST',
        body: JSON.stringify(newSale),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle validation errors', async () => {
      const invalidSale = { name: '' };
      mockApiFetch.mockRejectedValue(new Error('Validation failed'));

      await expect(createFlashSale(invalidSale as any)).rejects.toThrow(
        'Validation failed'
      );
    });

    it('should handle server errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Server error'));

      await expect(createFlashSale(mockFlashSale)).rejects.toThrow(
        'Server error'
      );
    });
  });

  describe('updateFlashSale', () => {
    it('should update existing flash sale', async () => {
      const updates = {
        name: 'Updated Name',
        description: 'Updated description',
      };
      const mockResponse = { updated: 1 };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await updateFlashSale('507f1f77bcf86cd799439011', updates);

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/flash-sales/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle partial updates', async () => {
      const updates = { name: 'Only Name Updated' };
      const mockResponse = { updated: 1 };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await updateFlashSale('507f1f77bcf86cd799439011', updates);

      expect(result).toEqual(mockResponse);
    });

    it('should handle non-existent flash sale', async () => {
      mockApiFetch.mockRejectedValue(new Error('Not found'));

      await expect(
        updateFlashSale('invalid-id', { name: 'Test' })
      ).rejects.toThrow('Not found');
    });

    it('should handle validation errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Validation failed'));

      await expect(
        updateFlashSale('507f1f77bcf86cd799439011', { name: '' })
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('deleteFlashSale', () => {
    it('should delete flash sale by ID', async () => {
      const mockResponse = { deleted: 1 };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await deleteFlashSale('507f1f77bcf86cd799439011');

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/flash-sales/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle non-existent flash sale', async () => {
      mockApiFetch.mockRejectedValue(new Error('Not found'));

      await expect(deleteFlashSale('invalid-id')).rejects.toThrow('Not found');
    });

    it('should handle server errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Server error'));

      await expect(deleteFlashSale('507f1f77bcf86cd799439011')).rejects.toThrow(
        'Server error'
      );
    });

    it('should accept various ID types', async () => {
      const mockResponse = { deleted: 1 };
      mockApiFetch.mockResolvedValue(mockResponse);

      await deleteFlashSale(123 as any);

      expect(mockApiFetch).toHaveBeenCalledWith('/flash-sales/123', {
        method: 'DELETE',
      });
    });
  });

  describe('Error handling', () => {
    it('should propagate network errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));

      await expect(listFlashSales()).rejects.toThrow('Network failure');
      await expect(getFlashSale('id')).rejects.toThrow('Network failure');
      await expect(createFlashSale({} as any)).rejects.toThrow(
        'Network failure'
      );
      await expect(updateFlashSale('id', {})).rejects.toThrow(
        'Network failure'
      );
      await expect(deleteFlashSale('id')).rejects.toThrow('Network failure');
    });

    it('should handle timeout errors', async () => {
      mockApiFetch.mockRejectedValue(new Error('Request timeout'));

      await expect(listFlashSales()).rejects.toThrow('Request timeout');
    });
  });
});
