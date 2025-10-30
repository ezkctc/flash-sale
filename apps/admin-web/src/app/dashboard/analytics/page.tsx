'use client';

import React from 'react';
import { Typography } from 'antd';
import { ProtectedRoute } from '../../../components/auth/protected-route';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { AnalyticsDashboard } from '../../../components/analytics/AnalyticsDashboard';

const { Title } = Typography;

export default function AnalyticsPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Analytics Dashboard</Title>
        </div>
        <AnalyticsDashboard />
      </AdminLayout>
    </ProtectedRoute>
  );
}