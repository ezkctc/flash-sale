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
      default: 'product',
    },

    description: {
      type: String,
      trim: true,
      required: false,
      default: 'this is a test product',
    },

    // Start and end datetime for the sale window
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

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
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Compound indexes for common query patterns

// 1. Admin list queries with filtering and sorting
flashSaleSchema.index({ status: 1, createdAt: -1 });
flashSaleSchema.index({ name: 'text' }); // Text search on name

// 2. Public sale queries - find active sales
flashSaleSchema.index({ 
  status: 1, 
  startsAt: 1, 
  endsAt: 1 
});

// 3. Time window queries for overlap detection
flashSaleSchema.index({ 
  status: 1, 
  startsAt: 1, 
  endsAt: 1, 
  productId: 1 
});

// 4. Inventory and time-based queries for worker
flashSaleSchema.index({ 
  _id: 1, 
  status: 1, 
  startsAt: 1, 
  endsAt: 1, 
  currentQuantity: 1 
});

// 5. Date range queries for admin filtering
flashSaleSchema.index({ startsAt: 1, endsAt: 1 });

// 6. Single field indexes for common filters
flashSaleSchema.index({ status: 1 });
flashSaleSchema.index({ createdAt: -1 });
flashSaleSchema.index({ startsAt: 1 });
flashSaleSchema.index({ endsAt: 1 });

// 👇 Export Mongoose model
export const flashSaleMongoModel = model<FlashSaleShape>(
  'flash_sales',
  flashSaleSchema,
  'flash_sales'
);
