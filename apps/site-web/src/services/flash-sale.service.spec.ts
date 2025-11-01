import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flashSaleService } from './flash-sale.service';

vi.mock('./api.service', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

import { apiService } from './api.service';

describe('flashSaleService', () => {
  beforeEach(() => vi.resetAllMocks());

  it('getCurrentSale calls the correct endpoint', async () => {
    (apiService.get as any).mockResolvedValue({ meta: { status: 'upcoming' } });
    const res = await flashSaleService.getCurrentSale();
    expect(res).toEqual({ meta: { status: 'upcoming' } });
    expect(apiService.get).toHaveBeenCalledWith('/flash-sales/public/sale');
  });

  it('getSaleById appends query param', async () => {
    (apiService.get as any).mockResolvedValue({ meta: { status: 'ongoing' } });
    await flashSaleService.getSaleById('abc123');
    expect(apiService.get).toHaveBeenCalledWith(
      '/flash-sales/public/sale?flashSaleId=abc123'
    );
  });
});

