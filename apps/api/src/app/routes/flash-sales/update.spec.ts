import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import updateRoute from './update';

vi.mock('@flash-sale/shared-types', async () => {
  const actual = await vi.importActual('@flash-sale/shared-types');
  return {
    ...actual,
    flashSaleMongoModel: {
      updateOne: vi.fn(),
    },
  };
});

vi.mock('../auth/auth-guard', () => ({
  authGuard: () => async () => {},
}));

describe('Flash Sales - Update Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    app.decorate('mongo', { db: {} });
    await app.register(updateRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should update flash sale successfully', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        name: 'Updated Sale',
        description: 'Updated description',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.updated).toBe(1);
  });

  it('should return 404 for non-existent flash sale', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockResolvedValue({
      matchedCount: 0,
      modifiedCount: 0,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        name: 'Updated Sale',
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.message).toBe('Not found');
  });

  it('should convert date strings to Date objects', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        startsAt: '2025-12-01T10:00:00Z',
        endsAt: '2025-12-01T20:00:00Z',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(flashSaleMongoModel.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      {
        $set: expect.objectContaining({
          startsAt: expect.any(Date),
          endsAt: expect.any(Date),
        }),
      }
    );
  });

  it('should allow partial updates', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        name: 'Updated Name',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(flashSaleMongoModel.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      {
        $set: expect.objectContaining({
          name: 'Updated Name',
          updatedAt: expect.any(Date),
        }),
      }
    );
  });

  it('should handle database errors gracefully', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockRejectedValue(
      new Error('Database error')
    );

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        name: 'Updated Sale',
      },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Failed');
  });

  it('should update quantity fields', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        currentQuantity: 50,
        startingQuantity: 100,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should update status field', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.updateOne as any).mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/507f1f77bcf86cd799439011',
      payload: {
        status: 'Completed',
      },
    });

    expect(response.statusCode).toBe(200);
  });
});
