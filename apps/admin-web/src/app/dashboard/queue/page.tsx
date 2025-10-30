'use client';

import React from 'react';
import { Typography } from 'antd';
import { ProtectedRoute } from '../../../components/auth/protected-route';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { QueueMonitor } from '../../../components/queue/QueueMonitor';

const { Title } = Typography;

export default function QueuePage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Queue Monitoring</Title>
        </div>
        <QueueMonitor />
      </AdminLayout>
    </ProtectedRoute>
  );
}