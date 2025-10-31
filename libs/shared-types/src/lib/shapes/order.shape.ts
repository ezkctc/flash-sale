import { ObjectId } from 'mongoose';
import { PaymentStatus } from '../enums/index.js';

export interface OrderShape {
  _id?: ObjectId;
  userEmail: string;
  flashSaleId?: ObjectId;
  flashSaleName?: string;
  paymentStatus: PaymentStatus;
  totalAmount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
