'use client';

import React from 'react';
import Link from 'next/link';
import { Layout, Typography, Button, Spin, Card } from 'antd';
import { useBearerSession } from '@/lib/auth/use-bearer-session';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

export default function Index() {
  const { data: session, isPending } = useBearerSession();

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Content
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Card
          style={{
            maxWidth: 500,
            width: '100%',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <Title level={2}>Flash Sale Admin Panel</Title>
          <Paragraph type="secondary">
            Manage your flash sales and orders efficiently.
          </Paragraph>

          {isPending ? (
            <span>Loading session...</span>
          ) : session ? (
            <Link href="/dashboard">
              <Button type="primary" size="large" block>
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button type="primary" size="large" block>
                Sign In
              </Button>
            </Link>
          )}
        </Card>
      </Content>
    </Layout>
  );
}
