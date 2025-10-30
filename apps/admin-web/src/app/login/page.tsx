'use client';

import React, { useState } from 'react';
import { Card, Typography, Button, Space } from 'antd';
import Link from 'next/link';
import { LoginForm } from '../../components/auth/login-form';
import { SignupForm } from '../../components/auth/signup-form';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card style={{ borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 8 }}>
            {mode === 'login'
              ? 'Sign in to your account'
              : 'Create a new account'}
          </Title>
          <Text type="secondary">
            {mode === 'login'
              ? 'Welcome back! Please enter your credentials.'
              : 'Join us and start managing your flash sales.'}
          </Text>
        </div>

        <div>{mode === 'login' ? <LoginForm /> : <SignupForm />}</div>

        <Space
          direction="vertical"
          style={{ width: '100%', marginTop: 24, textAlign: 'center' }}
          size="middle"
        >
          <Button
            type="link"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ padding: 0 }}
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Button>

          <Link href="/" style={{ fontSize: 13, color: '#555' }}>
            Back to home
          </Link>
        </Space>
      </Card>
    </div>
  );
}
