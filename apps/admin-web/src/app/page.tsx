'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth/auth-client';

export default function Index() {
  const { data: session, isPending } = useSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Flash Sale Admin Panel
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Manage your flash sales and orders
          </p>

          <div className="space-y-4">
            {isPending ? (
              <div className="text-gray-600">Loading...</div>
            ) : session ? (
              <Link
                href="/dashboard"
                className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
              >
                Go to Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
