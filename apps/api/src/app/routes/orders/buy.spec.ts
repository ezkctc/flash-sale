import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import buyRoute from './buy';

// Correctly mocking ioredis to export a mockable constructor (default export)
// This resolves the "no construct signatures" error.
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      // Mocked Redis methods
      pttl: vi.fn().mockResolvedValue(-2),
      multi: vi.fn().mockReturnValue({
        zadd: vi.fn().mockReturnThis(),
        zrank: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1], // zadd result (1 item added)
          [null, 0], // zrank result (position 0, means 1st in queue)
          [null, 1], // zcard result (queue size 1)
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
    // Since this route uses Redis and BullMQ directly, no fastify.decorate mock is strictly needed here
    // unless they are passed via decorators in the actual route implementation.
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
});
