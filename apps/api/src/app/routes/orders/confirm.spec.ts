import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import confirmRoute from './confirm';

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    pttl: vi.fn().mockResolvedValue(300000),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    zrem: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue(undefined),
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
      create: vi.fn(),
    },
    flashSaleMongoModel: {
      findOneAndUpdate: vi.fn(),
      updateOne: vi.fn(),
    },
  };
});

describe('Orders - Confirm Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(confirmRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should reject request without email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject request without flashSaleId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
