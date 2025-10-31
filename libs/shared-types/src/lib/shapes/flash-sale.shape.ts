import { ObjectId, Schema } from 'mongoose';
import { FlashSaleStatus } from '../enums/index.js';

export interface FlashSaleShape {
  _id?: Schema.Types.ObjectId | string;
  name: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  currentQuantity: number;
  startingQuantity: number;
  productId?: ObjectId;
  status: FlashSaleStatus | string;
  createdAt?: Date;
  updatedAt?: Date;
}
