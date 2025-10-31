import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import { ProtectedRoute } from './protected-route';
import React from 'react';

const mockPush = vi.fn();
const mockPathname = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname(),
}));

vi.mock('@/lib/auth/use-bearer-session', () => ({
  useBearerSession: vi.fn(),
}));

describe('ProtectedRoute', () => {
  const TestComponent = () => <div>Protected Content</div>;

  beforeEach(() => {
    mockPush.mockClear();
    mockPathname.mockClear();
  });

  it('should render children immediately for public routes', () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/login');
    useBearerSession.mockReturnValue({ data: null, isPending: false });

    render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should show loading state while checking auth for protected routes', () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/dashboard');
    useBearerSession.mockReturnValue({ data: null, isPending: true });

    render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to login when not authenticated on protected route', async () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/dashboard');
    useBearerSession.mockReturnValue({ data: null, isPending: false });

    render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('should render children when authenticated on protected route', async () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/dashboard');
    const mockSession = { user: { email: 'test@example.com' }, token: 'test-token' };
    useBearerSession.mockReturnValue({ data: mockSession, isPending: false });

    render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should not redirect when session is still loading', () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/dashboard');
    useBearerSession.mockReturnValue({ data: null, isPending: true });

    render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should handle session loading then authenticated', async () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/dashboard');

    const { rerender } = render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    useBearerSession.mockReturnValue({ data: null, isPending: true });
    rerender(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    const mockSession = { user: { email: 'test@example.com' }, token: 'test-token' };
    useBearerSession.mockReturnValue({ data: mockSession, isPending: false });

    rerender(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('should handle multiple protected routes', async () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    const mockSession = { user: { email: 'test@example.com' }, token: 'test-token' };
    useBearerSession.mockReturnValue({ data: mockSession, isPending: false });

    const protectedRoutes = ['/dashboard', '/dashboard/orders', '/dashboard/analytics'];

    for (const route of protectedRoutes) {
      mockPathname.mockReturnValue(route);
      mockPush.mockClear();

      const { unmount } = render(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
      });

      expect(mockPush).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('should render null when not authenticated and checking is done', async () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/dashboard');
    useBearerSession.mockReturnValue({ data: null, isPending: false });

    const { container } = render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should allow immediate rendering on public routes even with no session', () => {
    const { useBearerSession } = require('@/lib/auth/use-bearer-session');
    mockPathname.mockReturnValue('/login');
    useBearerSession.mockReturnValue({ data: null, isPending: false });

    render(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
