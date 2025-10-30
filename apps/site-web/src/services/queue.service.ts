import { apiService } from './api.service';
import type {
  BuyRequest,
  BuyResponse,
  QueuePosition,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
} from '@/types';

export const queueService = {
  /**
   * Add user to purchase queue
   */
  buyItem: (request: BuyRequest): Promise<BuyResponse> => {
    return apiService.post<BuyResponse>('/orders/buy', request);
  },

  /**
   * Get current queue position for user
   */
  getPosition: (email: string, flashSaleId: string): Promise<QueuePosition> => {
    const params = new URLSearchParams({ email, flashSaleId });
    return apiService.get<QueuePosition>(`/orders/position?${params}`);
  },

  /**
   * Confirm payment and complete purchase
   */
  confirmPayment: (
    email: string,
    flashSaleId: string,
    totalAmount = 1
  ): Promise<ConfirmPaymentResponse> => {
    return apiService.post<ConfirmPaymentResponse>('/orders/confirm', {
      email,
      flashSaleId,
      totalAmount,
    });
  },
};
