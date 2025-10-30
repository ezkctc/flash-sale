import { model, Schema } from 'mongoose';

import { OrderShape } from '../shapes/index.js';

/**
 * Represents a customer's order during or outside a flash sale.
 * Tracks payment status, user details, and audit info.
 */

export const orderSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId },

    // Reference to the user (optional if email is stored directly)
    userEmail: { type: String, trim: true, required: true, index: true },

    // Reference to a Flash Sale if order belongs to one
    flashSaleId: {
      type: Schema.Types.ObjectId,
      ref: 'flash_sales',
      required: false,
    },

    // Payment status
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // Optional total price or payment data
    totalAmount: { type: Number, required: false, default: 0 },
  },
  {
    versionKey: false,
    timestamps: true, // adds createdAt and updatedAt
  }
);

orderSchema.index({ userEmail: 1, flashSaleId: 1 }, { unique: true });

export const orderMongoModel = model<OrderShape>(
  'orders',
  orderSchema,
  'orders'
);
