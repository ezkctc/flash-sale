'use client';

import React from 'react';
import { Typography } from 'antd';
import { ProtectedRoute } from '../../../components/auth/protected-route';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { OrdersManager } from '../../../components/orders/OrdersManager';

const { Title } = Typography;

export default function OrdersPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Orders Management</Title>
        </div>
        <OrdersManager />
      </AdminLayout>
    </ProtectedRoute>
  );
}