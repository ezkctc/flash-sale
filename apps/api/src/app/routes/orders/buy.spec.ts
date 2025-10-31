import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import buyRoute from './buy';

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      pttl: vi.fn().mockResolvedValue(-2),
      multi: vi.fn().mockReturnValue({
        zadd: vi.fn().mockReturnThis(),
        zrank: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        exec: vi
          .fn()
          .mockResolvedValue([
            [null, 1],
            [null, 0],
            [null, 1],
          ]),
      }),
      quit: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@flash-sale/shared-types', async () => {
  const actual = await vi.importActual('@flash-sale/shared-types');
  return {
    ...actual,
    orderMongoModel: {
      findOne: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    },
  };
});

describe('Orders - Buy Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(buyRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should queue a purchase request successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toMatchObject({
      queued: true,
      position: 1,
      size: 1,
      hasActiveHold: false,
      email: 'test@example.com',
      flashSaleId: '507f1f77bcf86cd799439011',
    });
  });

  it('should reject request without email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('required');
  });

  it('should reject request without flashSaleId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'test@example.com',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('required');
  });

  it('should normalize email to lowercase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'TEST@EXAMPLE.COM',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.email).toBe('test@example.com');
  });

  it('should trim whitespace from inputs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: '  test@example.com  ',
        flashSaleId: '  507f1f77bcf86cd799439011  ',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.email).toBe('test@example.com');
    expect(body.flashSaleId).toBe('507f1f77bcf86cd799439011');
  });

  it('should detect existing paid order', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');
    (orderMongoModel.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'existing-order-id',
        paymentStatus: 'paid',
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('already purchased');
    expect(body.orderId).toBe('existing-order-id');
  });

  it('should detect active hold', async () => {
    const IORedis = (await import('ioredis')).default;
    const mockRedis = new IORedis();
    (mockRedis.pttl as any).mockResolvedValue(300000);

    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.hasActiveHold).toBe(true);
    expect(body.holdTtlSec).toBeGreaterThan(0);
  });

  it('should handle queue errors gracefully', async () => {
    const { Queue } = await import('bullmq');
    const mockQueue = new Queue('test');
    (mockQueue.add as any).mockRejectedValue(new Error('Queue error'));

    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Queue unavailable');
  });

  it('should include debug fields in response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/buy',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('queueName');
    expect(body).toHaveProperty('queuePrefix');
    expect(body).toHaveProperty('redisUrl');
    expect(body).toHaveProperty('zsetKey');
    expect(body).toHaveProperty('jobId');
  });
});
