'use client';

import React, { useState } from 'react';
import { Modal, Input, Button, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface EmailPromptProps {
  open: boolean;
  onSubmit: (email: string) => void;
}

export function EmailPrompt({ open, onSubmit }: EmailPromptProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!email || !email.includes('@')) {
      return;
    }
    setLoading(true);
    onSubmit(email);
    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Modal
      open={open}
      closable={false}
      maskClosable={false}
      footer={null}
      centered
      width={400}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <MailOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
        <Title level={3} style={{ marginBottom: 8 }}>
          Welcome to Flash Sale!
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Enter your email to participate in our exclusive flash sales
        </Text>
        
        <Input
          size="large"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{ marginBottom: 16 }}
          prefix={<MailOutlined />}
        />
        
        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleSubmit}
          disabled={!email || !email.includes('@')}
        >
          Continue
        </Button>
      </div>
    </Modal>
  );
}