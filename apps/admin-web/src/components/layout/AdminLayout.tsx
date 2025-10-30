'use client';

import React from 'react';
import { Layout, Typography, Avatar, Dropdown, Menu } from 'antd';
import { UserOutlined, LogoutOutlined, ShoppingCartOutlined, UnorderedListOutlined, BarChartOutlined, MonitorOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '../auth/logout-button';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  const dropdownItems = [
    {
      key: 'logout',
      label: <LogoutButton />,
      icon: <LogoutOutlined />,
    },
  ];

  const menuItems = [
    {
      key: 'analytics',
      icon: <BarChartOutlined />,
      label: <Link href="/dashboard">Analytics</Link>,
    },
    {
      key: 'flash-sales',
      icon: <ShoppingCartOutlined />,
      label: <Link href="/dashboard/flash-sales">Flash Sales</Link>,
    },
    {
      key: 'orders',
      icon: <UnorderedListOutlined />,
      label: <Link href="/dashboard/orders">Orders</Link>,
    },
    {
      key: 'queue',
      icon: <MonitorOutlined />,
      label: <Link href="/dashboard/queue">Queue Monitor</Link>,
    },
  ];

  // Determine selected key based on pathname
  const getSelectedKey = () => {
    if (pathname === '/dashboard') return ['analytics'];
    if (pathname.includes('/flash-sales')) return ['flash-sales'];
    if (pathname.includes('/orders')) return ['orders'];
    if (pathname.includes('/queue')) return ['queue'];
    return ['analytics'];
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Sider width={200} style={{ background: '#fff' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={4} style={{ margin: 0, textAlign: 'center' }}>
            Flash Sale
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={getSelectedKey()}
          style={{ height: '100%', borderRight: 0 }}
          items={menuItems}
        />
      </Sider>
      
      <Layout>
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
            <Dropdown menu={{ items: dropdownItems }} trigger={['click']}>
              <Avatar
                style={{ backgroundColor: '#1677ff', cursor: 'pointer' }}
                icon={<UserOutlined />}
              />
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: '24px' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}