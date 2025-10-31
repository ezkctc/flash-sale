import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueService } from './queue.service';

vi.mock('./api.service', () => {
  return {
    apiService: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

import { apiService } from './api.service';

describe('queueService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buyItem posts to /orders/buy with payload', async () => {
    (apiService.post as any).mockResolvedValue({ queued: true });

    const req = { email: 'u@example.com', flashSaleId: 'fs1' };
    const res = await queueService.buyItem(req as any);
    expect(res).toEqual({ queued: true });
    expect(apiService.post).toHaveBeenCalledWith('/orders/buy', req);
  });

  it('getPosition calls GET with email and flashSaleId params', async () => {
    (apiService.get as any).mockResolvedValue({ position: 1, size: 10 });

    await queueService.getPosition('u@example.com', 'fs1');

    expect(apiService.get).toHaveBeenCalledTimes(1);
    const [url] = (apiService.get as any).mock.calls[0];
    expect(url).toMatch('/orders/position?');
    // Assert query contains both params (order independent)
    expect(url).toMatch(/email=u%40example\.com/);
    expect(url).toMatch(/flashSaleId=fs1/);
  });

  it('confirmPayment posts to /orders/confirm with defaults', async () => {
    (apiService.post as any).mockResolvedValue({ ok: true, orderId: 'o1' });

    const res = await queueService.confirmPayment('u@example.com', 'fs1');
    expect(res).toEqual({ ok: true, orderId: 'o1' });
    expect(apiService.post).toHaveBeenCalledWith('/orders/confirm', {
      email: 'u@example.com',
      flashSaleId: 'fs1',
      totalAmount: 1,
    });
  });
});

