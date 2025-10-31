import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from './order.service';

vi.mock('./api.service', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

import { apiService } from './api.service';

describe('orderService', () => {
  beforeEach(() => vi.resetAllMocks());

  it('getOrdersByEmail builds URL with query params', async () => {
    (apiService.get as any).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const res = await orderService.getOrdersByEmail('user@example.com', 2, 5);
    expect(res).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(apiService.get).toHaveBeenCalledTimes(1);
    const [url] = (apiService.get as any).mock.calls[0];
    expect(url).toMatch('/orders/by-email?');
    expect(url).toMatch(/email=user%40example\.com/);
    expect(url).toMatch(/page=2/);
    expect(url).toMatch(/limit=5/);
  });
});

