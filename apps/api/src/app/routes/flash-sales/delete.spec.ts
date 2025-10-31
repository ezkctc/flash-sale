import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import deleteRoute from './delete';
import { Db } from 'mongodb'; // Import Db for context, though we mock it

vi.mock('@flash-sale/shared-types', async () => {
  const actual = await vi.importActual('@flash-sale/shared-types');
  return {
    ...actual,
    flashSaleMongoModel: {
      deleteOne: vi.fn(),
    },
  };
});

vi.mock('../auth/auth-guard', () => ({
  authGuard: () => async () => {},
}));

describe('Flash Sales - Delete Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    app.decorate('mongo', { db: {} } as any);
    await app.register(deleteRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should delete flash sale successfully', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.deleteOne as any).mockResolvedValue({
      deletedCount: 1,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/507f1f77bcf86cd799439011',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.deleted).toBe(1);
  });

  it('should return 0 deleted for non-existent flash sale', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.deleteOne as any).mockResolvedValue({
      deletedCount: 0,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/507f1f77bcf86cd799439011',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.deleted).toBe(0);
  });

  it('should handle database errors gracefully', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.deleteOne as any).mockRejectedValue(
      new Error('Database error')
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/507f1f77bcf86cd799439011',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Failed');
  });

  it('should call deleteOne with correct parameters', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.deleteOne as any).mockResolvedValue({
      deletedCount: 1,
    });

    await app.inject({
      method: 'DELETE',
      url: '/507f1f77bcf86cd799439011',
    });

    expect(flashSaleMongoModel.deleteOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
    });
  });

  it('should handle null deletedCount', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.deleteOne as any).mockResolvedValue({
      deletedCount: null,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/507f1f77bcf86cd799439011',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.deleted).toBe(0);
  });
});
