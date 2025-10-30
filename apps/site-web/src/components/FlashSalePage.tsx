'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Typography, Space, Button, Card, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';

import type { FlashSaleResponse } from '@/types';
import { flashSaleService } from '@/services';
import { storageUtil } from '@/utils';
import { EmailPrompt } from './EmailPrompt';
import { CountdownTimer } from './CountdownTimer';
import { FlashSaleCard } from './FlashSaleCard';
import { QueueStatus } from './QueueStatus';

const { Content, Header } = Layout;
const { Title, Text } = Typography;

export function FlashSalePage() {
  const [userEmail, setUserEmail] = useState<string>('');
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [flashSale, setFlashSale] = useState<FlashSaleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [inQueue, setInQueue] = useState(false);

  // Check for saved email on mount
  useEffect(() => {
    const savedEmail = storageUtil.getUserEmail();
    if (savedEmail) {
      setUserEmail(savedEmail);
    } else {
      setShowEmailPrompt(true);
    }
  }, []);

  // Fetch flash sale data
  const fetchFlashSale = async () => {
    setLoading(true);
    try {
      const data = await flashSaleService.getCurrentSale();
      setFlashSale(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load flash sale');
    } finally {
      setLoading(false);
    }
  };

  // Fetch flash sale on email set and periodically
  useEffect(() => {
    if (userEmail) {
      fetchFlashSale();
      const interval = setInterval(fetchFlashSale, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [userEmail]);

  const handleEmailSubmit = (email: string) => {
    setUserEmail(email);
    storageUtil.setUserEmail(email);
    setShowEmailPrompt(false);
    toast.success('Welcome! Loading flash sales...');
  };

  const handleBuyClick = () => {
    setInQueue(true);
  };

  const clearEmail = () => {
    storageUtil.clearUserEmail();
    setUserEmail('');
    setInQueue(false);
    setShowEmailPrompt(true);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <Title level={2} style={{ color: 'white', margin: 0 }}>
          ⚡ Flash Sale
        </Title>

        <Space>
          {userEmail && (
            <Text style={{ color: 'rgba(255,255,255,0.9)' }}>{userEmail}</Text>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchFlashSale}
            loading={loading}
            style={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderColor: 'rgba(255,255,255,0.3)',
              color: 'white',
            }}
          >
            Refresh
          </Button>
          {userEmail && (
            <Button
              onClick={clearEmail}
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderColor: 'rgba(255,255,255,0.2)',
                color: 'white',
              }}
            >
              Change Email
            </Button>
          )}
        </Space>
      </Header>

      <Content
        style={{
          padding: '24px',
          maxWidth: 800,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <EmailPrompt open={showEmailPrompt} onSubmit={handleEmailSubmit} />

        {userEmail && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {loading && !flashSale ? (
              <Card style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Title level={3}>Loading Flash Sale...</Title>
                </div>
              </Card>
            ) : flashSale ? (
              <>
                {/* Show countdown if upcoming */}
                {flashSale.meta.status === 'upcoming' &&
                  flashSale.meta.startsAt && (
                    <CountdownTimer
                      targetDate={flashSale.meta.startsAt}
                      title="Sale Starts In"
                    />
                  )}

                {/* Show flash sale card */}
                <FlashSaleCard
                  item={flashSale.item}
                  meta={flashSale.meta}
                  userEmail={userEmail}
                  onBuy={handleBuyClick}
                />

                {/* Show queue status if user is in queue */}
                {inQueue && flashSale.item && (
                  <QueueStatus
                    userEmail={userEmail}
                    flashSaleId={flashSale.item._id}
                  />
                )}
              </>
            ) : (
              <Card style={{ textAlign: 'center', padding: 40 }}>
                <Title level={3}>No Flash Sale Available</Title>
                <Text type="secondary">
                  Check back later for exciting deals!
                </Text>
              </Card>
            )}
          </Space>
        )}
      </Content>
    </Layout>
  );
}
