'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useBearerSession } from '@/lib/auth/use-bearer-session';

const PUBLIC_ROUTES = new Set(['/login']);

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  const { data: session, isPending } = useBearerSession();
  const router = useRouter();

  // start "checking" only for protected routes
  const [isChecking, setIsChecking] = useState(() => !isPublic);

  useEffect(() => {
    // If this is a public route, skip auth checks
    if (isPublic) {
      setIsChecking(false);
      return;
    }

    if (!isPending) {
      if (!session) {
        router.push('/login');
      } else {
        setIsChecking(false);
      }
    }
  }, [isPublic, isPending, session, router]);

  // Public routes: render immediately
  if (isPublic) return <>{children}</>;

  // Protected routes: show loader while checking
  if (isPending || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
