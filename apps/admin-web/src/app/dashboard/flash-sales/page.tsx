'use client';

import React from 'react';
import { Typography } from 'antd';
import { ProtectedRoute } from '../../../components/auth/protected-route';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { FlashSalesManager } from '../../../components/flash-sales/FlashSalesManager';

const { Title, Text } = Typography;

export default function FlashSalesPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Flash Sales Management</Title>
          <Text type="secondary">
            Create, edit, and manage your flash sales campaigns
          </Text>
        </div>
        <FlashSalesManager />
      </AdminLayout>
    </ProtectedRoute>
  );
}