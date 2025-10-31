import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

export const mockFetch = vi.fn();

export function setupFetchMock() {
  global.fetch = mockFetch;
  return mockFetch;
}

export function mockSuccessResponse<T>(data: T) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as Response);
}

export function mockErrorResponse(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({ error: message }),
    text: async () => message,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as Response);
}

export function mockLocalStorage() {
  const store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
}

export function setupLocalStorage() {
  const mockStorage = mockLocalStorage();
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
  });
  return mockStorage;
}

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from '@testing-library/react';
export { customRender as render };
