import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import signupRoute from './signup';

describe('Auth - Sign Up Route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });

    app.decorate('auth', {
      api: {
        signUpEmail: vi.fn(),
      },
    });

    await app.register(signupRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should sign up successfully with valid data', async () => {
    const mockResponse = {
      token: 'test-token-123',
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
    };

    (app.auth.api.signUpEmail as any).mockResolvedValue(mockResponse);

    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'test@example.com',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body).toEqual(mockResponse);
  });

  it('should require email field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should require password field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'test@example.com',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should validate email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'invalid-email',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should validate password minimum length', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'test@example.com',
        password: '12345',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should accept optional callbackURL', async () => {
    const mockResponse = {
      token: null,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
    };

    (app.auth.api.signUpEmail as any).mockResolvedValue(mockResponse);

    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'test@example.com',
        password: 'password123',
        callbackURL: '/welcome',
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('should handle auth service errors', async () => {
    (app.auth.api.signUpEmail as any).mockRejectedValue(
      new Error('User already exists')
    );

    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'test@example.com',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.message).toContain('Failed to sign up');
  });

  it('should handle null token in response', async () => {
    const mockResponse = {
      token: null,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
    };

    (app.auth.api.signUpEmail as any).mockResolvedValue(mockResponse);

    const response = await app.inject({
      method: 'POST',
      url: '/sign-up/email',
      payload: {
        email: 'test@example.com',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.token).toBeNull();
    expect(body.user).toBeDefined();
  });
});
