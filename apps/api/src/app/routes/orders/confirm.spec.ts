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

  it('should confirm order successfully with valid hold', async () => {
    const { orderMongoModel, flashSaleMongoModel } = await import(
      '@flash-sale/shared-types'
    );

    (flashSaleMongoModel.findOneAndUpdate as any).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      name: 'Test Sale',
      currentQuantity: 99,
    });

    (orderMongoModel.create as any).mockResolvedValue({
      _id: 'order-123',
      userEmail: 'test@example.com',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
        totalAmount: 99.99,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.ok).toBe(true);
    expect(body.orderId).toBe('order-123');
  });

  it('should reject confirmation without active hold', async () => {
    const { Redis } = await import('ioredis');
    const mockRedis = new Redis();
    (mockRedis.pttl as any).mockResolvedValue(-2);

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('No active hold');
  });

  it('should return existing order if already created', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');

    (orderMongoModel.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'existing-order',
        userEmail: 'test@example.com',
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.ok).toBe(true);
    expect(body.orderId).toBe('existing-order');
  });

  it('should reject when already being confirmed', async () => {
    const { Redis } = await import('ioredis');
    const mockRedis = new Redis();
    (mockRedis.set as any).mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('already being confirmed');
  });

  it('should handle out of stock scenario', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.findOneAndUpdate as any).mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Out of stock');
  });

  it('should compensate inventory on order creation failure', async () => {
    const { orderMongoModel, flashSaleMongoModel } = await import(
      '@flash-sale/shared-types'
    );

    (flashSaleMongoModel.findOneAndUpdate as any).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      currentQuantity: 99,
    });

    (orderMongoModel.create as any).mockRejectedValue(
      new Error('Order creation failed')
    );

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(flashSaleMongoModel.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $inc: { currentQuantity: 1 } }
    );
  });

  it('should normalize email to lowercase', async () => {
    const { orderMongoModel, flashSaleMongoModel } = await import(
      '@flash-sale/shared-types'
    );

    (flashSaleMongoModel.findOneAndUpdate as any).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      currentQuantity: 99,
    });

    (orderMongoModel.create as any).mockResolvedValue({
      _id: 'order-123',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'TEST@EXAMPLE.COM',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(orderMongoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: 'test@example.com',
      })
    );
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

  it('should set payment status to paid', async () => {
    const { orderMongoModel, flashSaleMongoModel } = await import(
      '@flash-sale/shared-types'
    );

    (flashSaleMongoModel.findOneAndUpdate as any).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      currentQuantity: 99,
    });

    (orderMongoModel.create as any).mockResolvedValue({
      _id: 'order-123',
    });

    await app.inject({
      method: 'POST',
      url: '/confirm',
      payload: {
        email: 'test@example.com',
        flashSaleId: '507f1f77bcf86cd799439011',
      },
    });

    expect(orderMongoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: 'paid',
      })
    );
  });
});
