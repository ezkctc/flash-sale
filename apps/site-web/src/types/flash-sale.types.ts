export interface FlashSaleItem {
  _id: string;
  name: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  currentQuantity: number;
  startingQuantity: number;
}

export interface FlashSaleMeta {
  status: 'ongoing' | 'upcoming' | 'ended' | 'not_found';
  soldOut: boolean;
  progress?: {
    remaining: number;
    starting: number;
    ratio: number;
  };
  startsAt?: string;
  endsAt?: string;
}

export interface FlashSaleResponse {
  item: FlashSaleItem | null;
  meta: FlashSaleMeta;
}