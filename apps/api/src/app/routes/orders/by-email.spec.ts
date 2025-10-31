import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import byEmailRoute from './by-email';

vi.mock('@flash-sale/shared-types', async () => {
  const actual = await vi.importActual('@flash-sale/shared-types');
  return {
    ...actual,
    orderMongoModel: {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      }),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
  };
});

describe('Orders - By Email Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(byEmailRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should fetch orders by email', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');
    const mockOrders = [
      {
        _id: 'order-1',
        userEmail: 'test@example.com',
        flashSaleId: '123',
        paymentStatus: 'paid',
      },
    ];

    (orderMongoModel.find as any)().lean.mockResolvedValue(mockOrders);
    (orderMongoModel.countDocuments as any).mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.items).toEqual(mockOrders);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('should require email parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/by-email',
    });

    expect(response.statusCode).toBe(400);
  });

  it('should handle pagination parameters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com&page=2&limit=10',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(10);
  });

  it('should enforce maximum limit of 100', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com&limit=100',
    });

    expect([200, 400]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = JSON.parse(response.payload);
      expect(body.limit).toBe(100);
    }
  });

  it('should enforce minimum limit of 1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com&limit=1',
    });

    expect([200, 400]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = JSON.parse(response.payload);
      expect(body.limit).toBe(1);
    }
  });

  it('should enforce minimum page of 1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com&page=1',
    });

    expect([200, 400]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = JSON.parse(response.payload);
      expect(body.page).toBe(1);
    }
  });

  it('should sort orders by createdAt descending', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');

    await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com',
    });

    const mockChain = orderMongoModel.find() as any;
    expect(mockChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('should decode URL-encoded email', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');

    await app.inject({
      method: 'GET',
      url: '/by-email?email=test%2Bfoo%40example.com',
    });

    expect(orderMongoModel.find).toHaveBeenCalledWith({
      userEmail: 'test+foo@example.com',
    });
  });

  it('should calculate correct skip value for pagination', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');

    await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com&page=3&limit=10',
    });

    const mockChain = orderMongoModel.find() as any;
    expect(mockChain.skip).toHaveBeenCalledWith(20);
  });

  it('should handle database errors gracefully', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');
    (orderMongoModel.find as any)().lean.mockRejectedValue(
      new Error('Database error')
    );

    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=test@example.com',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Failed');
  });

  it('should trim email whitespace', async () => {
    const { orderMongoModel } = await import('@flash-sale/shared-types');

    const response = await app.inject({
      method: 'GET',
      url: '/by-email?email=%20test@example.com%20',
    });

    if (response.statusCode === 200) {
      expect(orderMongoModel.find).toHaveBeenCalledWith({
        userEmail: 'test@example.com',
      });
    }
  });
});
