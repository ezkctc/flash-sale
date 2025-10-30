'use client';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { LogoutButton } from '@/components/auth/logout-button';
import { useSession } from '@/lib/auth/auth-client';

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-semibold text-gray-900">
                  Admin Dashboard
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  {session?.user?.email}
                </span>
                <LogoutButton />
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Welcome to the Admin Panel
              </h2>
              <p className="text-gray-600 mb-4">
                You are successfully authenticated with Better Auth!
              </p>

              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="font-semibold text-gray-900 mb-2">User Info:</h3>
                <pre className="text-sm text-gray-700 overflow-auto">
                  {JSON.stringify(session?.user, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
