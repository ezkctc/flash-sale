import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getToken, apiFetch, API_ROOT } from './api';
import {
  setupLocalStorage,
  mockSuccessResponse,
  mockErrorResponse,
} from '../../test/test-utils';

describe('API Service', () => {
  let mockStorage: ReturnType<typeof setupLocalStorage>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStorage = setupLocalStorage();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getToken', () => {
    it('should return token from localStorage', () => {
      mockStorage.setItem('auth_token', 'test-token-123');
      const token = getToken();
      expect(token).toBe('test-token-123');
    });

    it('should return null if no token exists', () => {
      const token = getToken();
      expect(token).toBeNull();
    });

    it('should return null for empty token', () => {
      mockStorage.setItem('auth_token', '');
      const token = getToken();
      expect(token).toBeNull();
    });

    it('should return null for whitespace-only token', () => {
      mockStorage.setItem('auth_token', '   ');
      const token = getToken();
      expect(token).toBeNull();
    });

    it('should return null on server-side', () => {
      const originalWindow = global.window;
      (global as any).window = undefined;

      const token = getToken();
      expect(token).toBeNull();

      global.window = originalWindow;
    });
  });

  describe('apiFetch', () => {
    it('should make successful GET request', async () => {
      const mockData = { success: true, data: 'test' };
      mockFetch.mockReturnValue(mockSuccessResponse(mockData));

      const result = await apiFetch('/test-endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_ROOT}/test-endpoint`,
        expect.objectContaining({
          credentials: 'include',
          cache: 'no-store',
        })
      );
      expect(result).toEqual(mockData);
    });

    it('should include authorization header when token exists', async () => {
      mockStorage.setItem('auth_token', 'test-token');
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint');

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('authorization')).toBe('Bearer test-token');
    });

    it('should not include authorization header when no token', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint');

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('authorization')).toBeNull();
    });

    it('should set content-type header when body is provided', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
      });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('content-type')).toBe('application/json');
    });

    it('should not override existing content-type header', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint', {
        method: 'POST',
        body: 'plain text',
        headers: { 'content-type': 'text/plain' },
      });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('content-type')).toBe('text/plain');
    });

    it('should parse JSON response', async () => {
      const mockData = { items: [1, 2, 3], total: 3 };
      mockFetch.mockReturnValue(mockSuccessResponse(mockData));

      const result = await apiFetch('/test-endpoint');

      expect(result).toEqual(mockData);
    });

    it('should handle non-JSON response', async () => {
      mockFetch.mockReturnValue(
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/plain' }),
          json: async () => ({}),
        } as Response)
      );

      const result = await apiFetch('/test-endpoint');

      expect(result).toBeUndefined();
    });

    it('should throw error on failed response', async () => {
      mockFetch.mockReturnValue(mockErrorResponse(400, 'Bad Request'));

      await expect(apiFetch('/test-endpoint')).rejects.toThrow('Bad Request');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(apiFetch('/test-endpoint')).rejects.toThrow('Network error');
    });

    it('should pass custom headers', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint', {
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('X-Custom-Header')).toBe('custom-value');
    });

    it('should handle POST request with body', async () => {
      const requestBody = { name: 'Test', value: 123 };
      mockFetch.mockReturnValue(mockSuccessResponse({ id: '123' }));

      await apiFetch('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_ROOT}/test-endpoint`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      );
    });

    it('should handle PUT request', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ updated: true }));

      await apiFetch('/test-endpoint/123', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_ROOT}/test-endpoint/123`,
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should handle DELETE request', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ deleted: true }));

      await apiFetch('/test-endpoint/123', {
        method: 'DELETE',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_ROOT}/test-endpoint/123`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should include credentials in all requests', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].credentials).toBe('include');
    });

    it('should set cache to no-store', async () => {
      mockFetch.mockReturnValue(mockSuccessResponse({ data: 'test' }));

      await apiFetch('/test-endpoint');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].cache).toBe('no-store');
    });
  });

  describe('API_ROOT configuration', () => {
    it('should construct correct API root', () => {
      expect(API_ROOT).toBeDefined();
      expect(typeof API_ROOT).toBe('string');
    });
  });
});
