'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card } from 'antd';
import { API_ROOT } from '@/lib/services/api';

import { toast } from 'react-toastify';

export function LoginForm() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);

    try {
      const res = await fetch(`${API_ROOT}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
        credentials: 'include',
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Sign in failed: ${res.status}`);
      }
      const json = await res.json();
      if (!json?.token) throw new Error('No token in response');
      localStorage.setItem('auth_token', json.token);
      toast.success('Signed in successfully');
      window.location.href = '/dashboard';
    } catch (err) {
      console.error(err);
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <Card title="Sign In" className="w-full max-w-sm shadow-md">
        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Enter a valid email address' },
            ]}
          >
            <Input placeholder="you@example.com" disabled={loading} />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password placeholder="••••••••" disabled={loading} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
