export interface Order {
  _id: string;
  userEmail: string;
  flashSaleId: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersResponse {
  items: Order[];
  total: number;
  page: number;
  limit: number;
}