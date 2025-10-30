export interface QueuePosition {
  position: number | null;
  size: number;
  holdTtlSec: number;
  hasActiveHold: boolean;
}

export interface BuyRequest {
  email: string;
  flashSaleId: string;
}

export interface BuyResponse {
  queued: boolean;
  position: number;
  size: number;
  hasActiveHold: boolean;
  holdTtlSec: number;
  jobId: string;
}

export interface ConfirmPaymentRequest {
  email: string;
  flashSaleId: string;
  totalAmount: number;
}

export interface ConfirmPaymentResponse {
  ok: boolean;
  orderId: string;
  inventoryLeft?: number;
}