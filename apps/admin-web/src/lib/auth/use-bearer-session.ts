'use client';

import { useEffect, useState } from 'react';

type SessionPayload = {
  session: { userId: string; expiresAt: string };
  user: { id: string; email?: string; name?: string };
};

const TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem(TOKEN_KEY);
  return t && t.trim() ? t : null;
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export function useBearerSession() {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const token = getToken();
        if (!token) {
          if (!cancelled) {
            setData(null);
            setIsPending(false);
          }
          return;
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/get-session`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include', // harmless; keeps parity w/ other calls
            cache: 'no-store',
          }
        );

        if (!res.ok) {
          if (res.status === 401) {
            // token invalid/expired → clear and treat as signed out
            clearToken();
          }
          const txt = await res.text().catch(() => '');
          throw new Error(txt || `Session fetch failed: ${res.status}`);
        }

        const json = (await res.json()) as SessionPayload;

        if (!cancelled) {
          setData(json);
          setIsPending(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Unknown error');
          setData(null);
          setIsPending(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isPending, error };
}
