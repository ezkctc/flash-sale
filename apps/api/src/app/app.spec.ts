import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { app } from './app';

describe('App Configuration', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = Fastify({ logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  it('should register app successfully', async () => {
    await expect(server.register(app)).resolves.not.toThrow();
  });

  it('should have cors plugin registered', async () => {
    await server.register(app);
    await server.ready();
    expect(server.hasPlugin('@fastify/cors')).toBe(true);
  });

  it('should have cookie plugin registered', async () => {
    await server.register(app);
    await server.ready();
    expect(server.hasPlugin('@fastify/cookie')).toBe(true);
  });

  it('should have jwt plugin registered', async () => {
    await server.register(app);
    await server.ready();
    expect(server.hasPlugin('@fastify/jwt')).toBe(true);
  });

  it('should have swagger plugin registered', async () => {
    await server.register(app);
    await server.ready();
    expect(server.hasPlugin('@fastify/swagger')).toBe(true);
  });

  it('should have authenticate decorator', async () => {
    await server.register(app);
    await server.ready();
    expect(server.hasDecorator('authenticate')).toBe(true);
  });

  it('should expose swagger documentation endpoint', async () => {
    await server.register(app);
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(response.statusCode).not.toBe(404);
  });

  it('should have health endpoint', async () => {
    await server.register(app);
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should handle CORS preflight requests', async () => {
    await server.register(app);
    await server.ready();

    const response = await server.inject({
      method: 'OPTIONS',
      url: '/',
    });

    expect([200, 204]).toContain(response.statusCode);
  });
});
