import { FlashSaleShape } from '@flash-sale/shared-types';

export const mockFlashSale: FlashSaleShape = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test Flash Sale',
  description: 'Test description',
  startsAt: new Date('2025-12-01T10:00:00Z'),
  endsAt: new Date('2025-12-01T12:00:00Z'),
  startingQuantity: 100,
  currentQuantity: 75,
  status: 'OnSchedule',
  createdAt: new Date('2025-11-01T00:00:00Z'),
  updatedAt: new Date('2025-11-01T00:00:00Z'),
};

export const mockFlashSales: FlashSaleShape[] = [
  mockFlashSale,
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Second Flash Sale',
    description: 'Another test',
    startsAt: new Date('2025-12-02T10:00:00Z'),
    endsAt: new Date('2025-12-02T12:00:00Z'),
    startingQuantity: 50,
    currentQuantity: 25,
    status: 'Active',
    createdAt: new Date('2025-11-02T00:00:00Z'),
    updatedAt: new Date('2025-11-02T00:00:00Z'),
  },
];

export const mockOrder = {
  _id: '607f1f77bcf86cd799439013',
  userEmail: 'test@example.com',
  flashSaleId: '507f1f77bcf86cd799439011',
  paymentStatus: 'paid',
  totalAmount: 99.99,
  createdAt: new Date('2025-11-15T12:00:00Z').toISOString(),
  updatedAt: new Date('2025-11-15T12:00:00Z').toISOString(),
};

export const mockOrders = [
  mockOrder,
  {
    _id: '607f1f77bcf86cd799439014',
    userEmail: 'user2@example.com',
    flashSaleId: '507f1f77bcf86cd799439012',
    paymentStatus: 'pending',
    totalAmount: 49.99,
    createdAt: new Date('2025-11-16T12:00:00Z').toISOString(),
    updatedAt: new Date('2025-11-16T12:00:00Z').toISOString(),
  },
];

export const mockQueueOverview = {
  queueName: 'order-queue-507f1f77bcf86cd799439011',
  jobCounts: {
    waiting: 10,
    active: 2,
    completed: 50,
    failed: 1,
    delayed: 0,
    paused: 0,
  },
  lineSize: 12,
  flashSaleId: '507f1f77bcf86cd799439011',
  ts: Date.now(),
};

export const mockQueueMembers = [
  {
    email: 'user1@example.com',
    position: 1,
    score: Date.now() - 1000,
    holdTtlSec: 300,
  },
  {
    email: 'user2@example.com',
    position: 2,
    score: Date.now() - 900,
    holdTtlSec: 0,
  },
];

export const mockAnalytics = {
  totalSales: 5,
  totalOrders: 100,
  totalRevenue: 5000.0,
  activeSales: 2,
  recentOrders: mockOrders,
  topSales: mockFlashSales,
};
