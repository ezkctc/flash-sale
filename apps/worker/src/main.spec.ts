import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Worker, Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';

// Mock all external dependencies
vi.mock('bullmq');
vi.mock('ioredis');
vi.mock('mongoose');
vi.mock('@flash-sale/shared-types');
vi.mock('@flash-sale/shared-utils');

// Mock environment variables
const mockEnv = {
  REDIS_URL: 'redis://:redispass@localhost:6379',
  MONGODB_URI: 'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin',
  QUEUE_NAME: 'sale-processing-queue',
  BULLMQ_PREFIX: 'flashsale',
  HOLD_TTL_SECONDS: '900',
};

Object.assign(process.env, mockEnv);

describe('Worker Main', () => {
  let mockRedis: any;
  let mockQueue: any;
  let mockQueueEvents: any;
  let mockWorker: any;
  let mockMongooseConnection: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      zrem: vi.fn(),
      incr: vi.fn(),
      decr: vi.fn(),
      quit: vi.fn(),
    };
    (Redis as any).mockImplementation(() => mockRedis);

    // Mock Queue
    mockQueue = {
      add: vi.fn(),
      close: vi.fn(),
    };
    (Queue as any).mockImplementation(() => mockQueue);

    // Mock QueueEvents
    mockQueueEvents = {
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      on: vi.fn(),
    };
    (QueueEvents as any).mockImplementation(() => mockQueueEvents);

    // Mock Worker
    mockWorker = {
      on: vi.fn(),
      close: vi.fn(),
    };
    (Worker as any).mockImplementation(() => mockWorker);

    // Mock Mongoose
    mockMongooseConnection = {
      getClient: vi.fn(),
      db: { databaseName: 'test_db' },
    };
    (mongoose.connect as any).mockResolvedValue(undefined);
    (mongoose.connection as any) = mockMongooseConnection;
    (mongoose.disconnect as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize all services correctly', async () => {
    // Import the main module to trigger initialization
    await import('./main');

    expect(mongoose.connect).toHaveBeenCalledWith(mockEnv.MONGODB_URI);
    expect(Redis).toHaveBeenCalledWith(mockEnv.REDIS_URL);
    expect(Queue).toHaveBeenCalledWith(mockEnv.QUEUE_NAME, {
      connection: { url: mockEnv.REDIS_URL },
      prefix: mockEnv.BULLMQ_PREFIX,
    });
    expect(QueueEvents).toHaveBeenCalledWith(mockEnv.QUEUE_NAME, {
      connection: { url: mockEnv.REDIS_URL },
      prefix: mockEnv.BULLMQ_PREFIX,
    });
  });

  it('should create worker with correct configuration', async () => {
    await import('./main');

    expect(Worker).toHaveBeenCalledWith(
      mockEnv.QUEUE_NAME,
      expect.any(Function),
      {
        connection: { url: mockEnv.REDIS_URL },
        prefix: mockEnv.BULLMQ_PREFIX,
        concurrency: 8,
        lockDuration: 30000,
      }
    );
  });

  it('should set up worker event listeners', async () => {
    await import('./main');

    expect(mockWorker.on).toHaveBeenCalledWith('active', expect.any(Function));
    expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('should set up queue events listeners', async () => {
    await import('./main');

    expect(mockQueueEvents.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('should handle process shutdown signals', async () => {
    const originalProcessOn = process.on;
    const mockProcessOn = vi.fn();
    process.on = mockProcessOn;

    await import('./main');

    expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

    process.on = originalProcessOn;
  });
});