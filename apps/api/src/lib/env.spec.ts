import { describe, it, expect } from 'vitest';
import { env } from './env';

describe('Environment Configuration', () => {
  it('should load environment variables', () => {
    expect(env).toBeDefined();
    expect(env.BEND_HOST).toBeDefined();
    expect(env.BEND_PORT).toBeDefined();
  });

  it('should parse numeric environment variables', () => {
    expect(typeof env.BEND_PORT).toBe('number');
    expect(env.BEND_PORT).toBeGreaterThan(0);
  });

  it('should have required configuration fields', () => {
    expect(env.MONGODB_URI).toBeDefined();
    expect(env.REDIS_URL).toBeDefined();
  });
});
