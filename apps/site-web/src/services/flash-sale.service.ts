import { apiService } from './api.service';
import type { FlashSaleResponse } from '@/types';

export const flashSaleService = {
  /**
   * Get current or next upcoming flash sale
   */
  getCurrentSale: (): Promise<FlashSaleResponse> => {
    return apiService.get<FlashSaleResponse>('/flash-sales/public/sale');
  },

  /**
   * Get specific flash sale by ID
   */
  getSaleById: (flashSaleId: string): Promise<FlashSaleResponse> => {
    return apiService.get<FlashSaleResponse>(
      `/flash-sales/public/sale?flashSaleId=${flashSaleId}`
    );
  },
};