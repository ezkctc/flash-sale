import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  let mockApp: FastifyInstance;
  let mockRequest: FastifyRequest;
  let mockReply: FastifyReply;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      log: { error: vi.fn() },
    } as any;

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    } as any;

    mockApp = {
      mongo: {
        db: {
          collection: vi.fn(),
        },
      },
    } as any;
  });

  it('should reject request without authorization header', async () => {
    const guard = authGuard(mockApp);
    await guard(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(mockReply.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('Missing bearer token')
    );
  });

  it('should reject request with invalid token format', async () => {
    mockRequest.headers.authorization = 'InvalidFormat';

    const mockCollection = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    (mockApp.mongo.db.collection as any).mockReturnValue(mockCollection);

    const guard = authGuard(mockApp);
    await guard(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
  });

  it('should reject request with unknown token', async () => {
    mockRequest.headers.authorization = 'Bearer valid-token';

    const mockCollection = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    (mockApp.mongo.db.collection as any).mockReturnValue(mockCollection);

    const guard = authGuard(mockApp);
    await guard(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(mockReply.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('Unknown token')
    );
  });

  it('should reject expired token', async () => {
    mockRequest.headers.authorization = 'Bearer valid-token';

    const expiredDate = new Date(Date.now() - 1000);
    const mockSession = {
      _id: 'session-id',
      token: 'valid-token',
      userId: 'user-123',
      expiresAt: expiredDate,
    };

    const mockCollection = {
      findOne: vi.fn().mockResolvedValue(mockSession),
      deleteOne: vi.fn().mockResolvedValue({}),
    };
    (mockApp.mongo.db.collection as any).mockReturnValue(mockCollection);

    const guard = authGuard(mockApp);
    await guard(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('Token expired')
    );
    expect(mockCollection.deleteOne).toHaveBeenCalled();
  });

  it('should accept valid token and set session', async () => {
    mockRequest.headers.authorization = 'Bearer valid-token';

    const futureDate = new Date(Date.now() + 100000);
    const mockSession = {
      _id: 'session-id',
      token: 'valid-token',
      userId: 'user-123',
      email: 'test@example.com',
      expiresAt: futureDate,
    };

    const mockCollection = {
      findOne: vi.fn().mockResolvedValue(mockSession),
    };
    (mockApp.mongo.db.collection as any).mockReturnValue(mockCollection);

    const guard = authGuard(mockApp);
    await guard(mockRequest, mockReply);

    expect((mockRequest as any).session).toEqual(mockSession);
    expect((mockRequest as any).userId).toBe('user-123');
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('should handle session with string expiresAt', async () => {
    mockRequest.headers.authorization = 'Bearer valid-token';

    const futureDate = new Date(Date.now() + 100000);
    const mockSession = {
      _id: 'session-id',
      token: 'valid-token',
      userId: 'user-123',
      expiresAt: futureDate.toISOString(),
    };

    const mockCollection = {
      findOne: vi.fn().mockResolvedValue(mockSession),
    };
    (mockApp.mongo.db.collection as any).mockReturnValue(mockCollection);

    const guard = authGuard(mockApp);
    await guard(mockRequest, mockReply);

    expect((mockRequest as any).userId).toBe('user-123');
    expect(mockReply.code).not.toHaveBeenCalled();
  });
});
