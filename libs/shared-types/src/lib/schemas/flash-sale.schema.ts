import { model, Schema } from 'mongoose';

import { FlashSaleShape } from '../shapes/index.js';
import { FlashSaleStatus } from '../enums/index.js';

/**
 * Represents a flash sale event.
 * Includes scheduling, inventory tracking, and metadata.
 */

export const flashSaleSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
      index: true,
      default: 'product',
    },

    description: {
      type: String,
      trim: true,
      required: false,
      default: 'this is a test product',
    },

    // Start and end datetime for the sale window
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },

    // Inventory tracking

    currentQuantity: { type: Number, required: true, default: 0 },
    startingQuantity: { type: Number, required: true, default: 0 },

    // Optional: product association or category
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'products',
      required: false,
    },

    status: {
      type: String,
      enum: FlashSaleStatus,
      default: FlashSaleStatus.OnSchedule,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// 👇 Export Mongoose model
export const flashSaleMongoModel = model<FlashSaleShape>(
  'flash_sales',
  flashSaleSchema,
  'flash_sales'
);
