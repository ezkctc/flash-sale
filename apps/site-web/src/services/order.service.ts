import { apiService } from './api.service';
import type { OrdersResponse } from '@/types';

export const orderService = {
  /**
   * Get orders by user email
   */
  getOrdersByEmail: (email: string, page = 1, limit = 20): Promise<OrdersResponse> => {
    const params = new URLSearchParams({
      email,
      page: page.toString(),
      limit: limit.toString(),
    });
    return apiService.get<OrdersResponse>(`/orders/by-email?${params}`);
  },
};