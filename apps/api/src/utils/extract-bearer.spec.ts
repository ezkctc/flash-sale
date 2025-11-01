import { describe, it, expect } from 'vitest';
import { extractBearerToken } from './extract-bearer';

describe('extractBearerToken', () => {
  it('should extract token from Bearer header', () => {
    const token = extractBearerToken('Bearer abc123');
    expect(token).toBe('abc123');
  });

  it('should handle case-insensitive Bearer prefix', () => {
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
    expect(extractBearerToken('BEARER abc123')).toBe('abc123');
    expect(extractBearerToken('BeArEr abc123')).toBe('abc123');
  });

  it('should handle multiple Bearer prefixes', () => {
    const token = extractBearerToken('Bearer Bearer abc123');
    expect(token).toBe('abc123');
  });

  it('should return null for missing header', () => {
    expect(extractBearerToken()).toBe(null);
    expect(extractBearerToken(undefined)).toBe(null);
  });

  it('should return null for empty string', () => {
    expect(extractBearerToken('')).toBe(null);
    expect(extractBearerToken('   ')).toBe(null);
  });

  it('should return null for Bearer without token', () => {
    expect(extractBearerToken('Bearer')).toBe(null);
    expect(extractBearerToken('Bearer ')).toBe(null);
  });

  it('should handle array of headers', () => {
    expect(extractBearerToken(['Bearer abc123'])).toBe('abc123');
    expect(extractBearerToken(['Bearer abc123', 'other'])).toBe('abc123');
  });

  it('should handle tokens with special characters', () => {
    const token = 'abc-123_def.ghi';
    expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it('should trim whitespace around token', () => {
    expect(extractBearerToken('Bearer   abc123   ')).toBe('abc123');
  });
});
