'use client';

const AUTH_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/auth';
export const API_ROOT = AUTH_BASE.replace(/\/api\/auth\/?$/, '');

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem('auth_token');
  return t && t.trim() ? t : null;
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers as any);
  if (!headers.has('content-type') && init.body)
    headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed: ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  return undefined as T;
}
