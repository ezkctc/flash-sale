'use client';

import React, { useState } from 'react';
import { Button } from 'antd';
import { authClient } from '@/lib/auth/auth-client'; // ✅ import the full client
import { toast } from 'react-toastify';

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await authClient.signOut();
      toast.success('Signed out successfully');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    } catch (err) {
      console.error('Failed to sign out:', err);
      toast.error('Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="primary"
      danger
      loading={loading}
      onClick={handleLogout}
      className="mt-4"
      block
    >
      {loading ? 'Signing out...' : 'Sign Out'}
    </Button>
  );
}
