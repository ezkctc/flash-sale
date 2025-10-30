'use client';

import React from 'react';
import { Typography } from 'antd';
import { ProtectedRoute } from '../../components/auth/protected-route';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard';

const { Title, Text } = Typography;

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Analytics Overview</Title>
          <Text type="secondary">
            Monitor your flash sales performance and key metrics
          </Text>
        </div>
        <AnalyticsDashboard />
      </AdminLayout>
    </ProtectedRoute>
  );
}
