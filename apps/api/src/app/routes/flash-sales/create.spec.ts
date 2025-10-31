import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import createRoute from './create';
import { FlashSaleStatus } from '@flash-sale/shared-types';

vi.mock('@flash-sale/shared-types', async () => {
  const actual = await vi.importActual('@flash-sale/shared-types');
  return {
    ...actual,
    flashSaleMongoModel: {
      create: vi.fn(),
      exists: vi.fn(),
    },
  };
});

vi.mock('../auth/auth-guard', () => ({
  authGuard: () => async () => {},
}));

describe('Flash Sales - Create Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    app.decorate('mongo', {
      db: {},
    });
    await app.register(createRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should create flash sale with valid data', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');

    (flashSaleMongoModel.exists as any).mockResolvedValue(false);
    (flashSaleMongoModel.create as any).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        description: 'Test Description',
        startsAt: '2025-12-01T10:00:00Z',
        endsAt: '2025-12-01T20:00:00Z',
        startingQuantity: 100,
        currentQuantity: 100,
        status: FlashSaleStatus.OnSchedule,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('id');
  });

  it('should reject invalid date format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        startsAt: 'invalid-date',
        endsAt: '2025-12-01T20:00:00Z',
        startingQuantity: 100,
        currentQuantity: 100,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message || body.error).toBeTruthy();
  });

  it('should reject endsAt before startsAt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        startsAt: '2025-12-01T20:00:00Z',
        endsAt: '2025-12-01T10:00:00Z',
        startingQuantity: 100,
        currentQuantity: 100,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('after');
  });

  it('should reject zero or negative quantities', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        startsAt: '2025-12-01T10:00:00Z',
        endsAt: '2025-12-01T20:00:00Z',
        startingQuantity: 0,
        currentQuantity: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message || body.error).toBeTruthy();
  });

  it('should reject overlapping flash sales', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');
    (flashSaleMongoModel.exists as any).mockResolvedValue(true);

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        startsAt: '2025-12-01T10:00:00Z',
        endsAt: '2025-12-01T20:00:00Z',
        startingQuantity: 100,
        currentQuantity: 100,
        status: FlashSaleStatus.OnSchedule,
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Overlapping');
  });

  it('should handle database errors gracefully', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');

    (flashSaleMongoModel.exists as any).mockResolvedValue(false);
    (flashSaleMongoModel.create as any).mockRejectedValue(
      new Error('Database error')
    );

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        startsAt: '2025-12-01T10:00:00Z',
        endsAt: '2025-12-01T20:00:00Z',
        startingQuantity: 100,
        currentQuantity: 100,
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should use default status when not provided', async () => {
    const { flashSaleMongoModel } = await import('@flash-sale/shared-types');

    (flashSaleMongoModel.exists as any).mockResolvedValue(false);
    (flashSaleMongoModel.create as any).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'Test Sale',
        startsAt: '2025-12-01T10:00:00Z',
        endsAt: '2025-12-01T20:00:00Z',
        startingQuantity: 100,
        currentQuantity: 100,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(flashSaleMongoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: FlashSaleStatus.OnSchedule,
      })
    );
  });
});
