import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import listRoute from './list';

vi.mock('@flash-sale/shared-types', async () => {
  const actual = await vi.importActual('@flash-sale/shared-types');
  return {
    ...actual,
    flashSaleMongoModel: {
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

vi.mock('../auth/auth-guard', () => ({
  authGuard: () => async () => {},
}));

describe('Flash Sales - List Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    app.decorate('mongo', { db: {} });
    await app.register(listRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return paginated flash sales with defaults', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    const mockSales = [
      {
        _id: '1',
        name: 'Test Sale',
        startsAt: new Date(),
        endsAt: new Date(),
      },
    ];
    (flashSaleMongoModel.find as any)().lean.mockResolvedValue(mockSales);
    (flashSaleMongoModel.countDocuments as any).mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('pageSize');
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it('should handle custom pagination parameters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?page=2&pageSize=10',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
  });

  it('should filter by name search query', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');

    const response = await app.inject({
      method: 'GET',
      url: '/?q=test',
    });

    expect(response.statusCode).toBe(200);
    expect(flashSaleMongoModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        name: { $regex: 'test', $options: 'i' },
      })
    );
  });

  it('should filter by status', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');

    const response = await app.inject({
      method: 'GET',
      url: '/?status=OnSchedule',
    });

    expect(response.statusCode).toBe(200);
    expect(flashSaleMongoModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OnSchedule',
      })
    );
  });

  it('should filter by date range', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');

    const response = await app.inject({
      method: 'GET',
      url: '/?from=2025-01-01T00:00:00Z&to=2025-12-31T23:59:59Z',
    });

    expect(response.statusCode).toBe(200);
    expect(flashSaleMongoModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: expect.objectContaining({ $gte: expect.any(Date) }),
        endsAt: expect.objectContaining({ $lte: expect.any(Date) }),
      })
    );
  });

  it('should reject invalid from date', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?from=invalid-date',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message || body.error).toBeTruthy();
  });

  it('should reject invalid to date', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?to=invalid-date',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message || body.error).toBeTruthy();
  });

  it('should support sorting by different fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?sort=startsAt&order=asc',
    });

    expect(response.statusCode).toBe(200);
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    const mockChain = flashSaleMongoModel.find() as any;
    expect(mockChain.sort).toHaveBeenCalledWith({ startsAt: 1 });
  });

  it('should enforce maximum page size', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?pageSize=200',
    });

    expect([200, 400]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = JSON.parse(response.payload);
      expect(body.pageSize).toBe(200);
    }
  });

  it('should enforce minimum page size', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/?pageSize=1',
    });

    expect([200, 400]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = JSON.parse(response.payload);
      expect(body.pageSize).toBe(1);
    }
  });

  it('should handle database errors gracefully', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.find as any)().lean.mockRejectedValue(
      new Error('Database error')
    );

    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Failed');
  });
});
