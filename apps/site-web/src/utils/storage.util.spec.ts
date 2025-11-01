// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storageUtil } from './storage.util';

describe('storageUtil', () => {
  const KEY = 'user_email';

  beforeEach(() => {
    // Ensure a clean localStorage per test
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets and gets user email from localStorage', () => {
    expect(storageUtil.getUserEmail()).toBeNull();

    storageUtil.setUserEmail('test@example.com');
    expect(localStorage.getItem(KEY)).toBe('test@example.com');
    expect(storageUtil.getUserEmail()).toBe('test@example.com');
  });

  it('clears user email from localStorage', () => {
    storageUtil.setUserEmail('clearme@example.com');
    expect(localStorage.getItem(KEY)).toBe('clearme@example.com');

    storageUtil.clearUserEmail();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(storageUtil.getUserEmail()).toBeNull();
  });

  it('is a no-op on server (window undefined)', () => {
    // Simulate server environment
    vi.stubGlobal('window', undefined as unknown as Window);

    // Should not throw and should not access localStorage
    expect(storageUtil.getUserEmail()).toBeNull();
    // set and clear should be safe no-ops
    storageUtil.setUserEmail('server@example.com');
    storageUtil.clearUserEmail();
  });
});
