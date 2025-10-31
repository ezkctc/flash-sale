import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiService, ApiError } from './api.service';

describe('apiService', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_API_URL = 'http://test.api';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns empty object when non-JSON response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? 'text/plain' : null,
      },
      text: async () => 'pong',
    } as any);
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiService.get<any>('/text');
    expect(result).toEqual({});
  });

  it('throws ApiError with status and code on JSON error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? 'application/json' : null,
      },
      json: async () => ({ message: 'Not found', code: 'NOT_FOUND' }),
    } as any);
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiService.get('/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
    } satisfies Partial<ApiError>);
  });

  it('throws ApiError with text body on non-JSON error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? 'text/plain' : null,
      },
      json: async () => {
        throw new Error('not json');
      },
      text: async () => 'Server error',
    } as any);
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiService.get('/oops')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Server error',
    } satisfies Partial<ApiError>);
  });

  it('throws ApiError on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiService.get('/any')).rejects.toBeInstanceOf(ApiError);
    await expect(apiService.get('/any')).rejects.toMatchObject({
      message: 'Network down',
    });
  });

  it('POST sends JSON body and parses response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-type' ? 'application/json' : null,
      },
      json: async () => ({ created: true }),
    } as any);
    vi.stubGlobal('fetch', mockFetch);

    const payload = { a: 1 };
    const res = await apiService.post<{ created: boolean }>('/items', payload);
    expect(res).toEqual({ created: true });
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify(payload));
    expect((options.headers as any)['Content-Type']).toBe('application/json');
  });
});
