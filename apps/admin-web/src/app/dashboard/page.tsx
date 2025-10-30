'use client';

import React from 'react';
import { Layout, Typography, Avatar, Dropdown, Card } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { ProtectedRoute } from '../../components/auth/protected-route';
import { LogoutButton } from '../../components/auth/logout-button';
import { FlashSalesManager } from '../../components/flash-sales/FlashSalesManager';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function DashboardPage() {
  const menuItems = [
    {
      key: 'logout',
      label: <LogoutButton />,
      icon: <LogoutOutlined />,
    },
  ];

  return (
    <ProtectedRoute>
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header
          style={{
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Admin Dashboard
          </Title>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Avatar
                style={{ backgroundColor: '#1677ff', cursor: 'pointer' }}
                icon={<UserOutlined />}
              />
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: '24px' }}>
          <FlashSalesManager />
        </Content>
      </Layout>
    </ProtectedRoute>
  );
}
