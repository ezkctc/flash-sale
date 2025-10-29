import { ObjectId } from 'mongoose';
import { FlashSaleStatus } from '../enums/index.js';

export interface FlashSaleShape {
  _id?: ObjectId;
  name: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  currentQuantity: number;
  startingQuantity: number;
  productId?: ObjectId;
  status: FlashSaleStatus;
  createdAt?: Date;
  updatedAt?: Date;
}
