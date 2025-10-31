import { model, Schema } from 'mongoose';

import { OrderShape } from '../shapes/index.js';

/**
 * Represents a customer's order during or outside a flash sale.
 * Tracks payment status, user details, and audit info.
 */

export const orderSchema = new Schema(
  {
    // Reference to the user (optional if email is stored directly)
    userEmail: { type: String, trim: true, required: true },
    flashSaleName: { type: String, trim: true, required: false },
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
    },

    // Optional total price or payment data
    totalAmount: { type: Number, required: false, default: 0 },
  },
  {
    versionKey: false,
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Compound indexes for common query patterns

// 1. Unique constraint - one order per user per flash sale
orderSchema.index({ userEmail: 1, flashSaleId: 1 }, { unique: true });

// 2. User order history queries (by-email endpoint)
orderSchema.index({ userEmail: 1, createdAt: -1 });

// 3. Admin order listing with filters
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ flashSaleId: 1, createdAt: -1 });
orderSchema.index({ flashSaleId: 1, paymentStatus: 1 });

// 4. Purchase guard queries - check existing paid orders
orderSchema.index({ userEmail: 1, flashSaleId: 1, paymentStatus: 1 });

// 5. Analytics queries
orderSchema.index({ paymentStatus: 1, totalAmount: 1 });
orderSchema.index({ createdAt: -1, paymentStatus: 1 });

// 6. Single field indexes for common filters
orderSchema.index({ userEmail: 1 });
orderSchema.index({ flashSaleId: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

export const orderMongoModel = model<OrderShape>(
  'orders',
  orderSchema,
  'orders'
);
