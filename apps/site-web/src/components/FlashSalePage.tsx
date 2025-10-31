'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Typography, Space, Button, Card, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';

import type { FlashSaleResponse } from '@/types';
import { flashSaleService, queueService } from '@/services';
import { storageUtil } from '@/utils';
import { QueuePosition } from '@/types';

import { EmailPrompt } from './EmailPrompt';
import { CountdownTimer } from './CountdownTimer';
import { FlashSaleCard } from './FlashSaleCard';
import { QueueStatus } from './QueueStatus';
import { UserOrders } from './UserOrders';

const { Content, Header } = Layout;
const { Title, Text } = Typography;

export function FlashSalePage() {
  const [userEmail, setUserEmail] = useState<string>('');
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [flashSale, setFlashSale] = useState<FlashSaleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueuePosition | null>(null); // Check for saved email on mount
  const [countdownCompleted, setCountdownCompleted] = useState(false);

  // Force re-render when countdown completes
  const [forceUpdate, setForceUpdate] = useState(0);

  useEffect(() => {
    const savedEmail = storageUtil.getUserEmail();
    if (savedEmail) {
      setUserEmail(savedEmail);
    } else {
      setShowEmailPrompt(true);
    }
  }, []); // Fetch flash sale data

  const fetchFlashSale = async () => {
    setLoading(true);
    try {
      const data = await flashSaleService.getCurrentSale();
      setFlashSale(data);
      
      // Reset countdown completion if we get a new sale
      if (data.meta.status === 'upcoming') {
        setCountdownCompleted(false);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load flash sale');
    } finally {
      setLoading(false);
    }
  }; // Check queue status periodically

  const checkQueueStatus = async () => {
    if (!userEmail || !flashSale?.item?._id) return;

    try {
      const position = await queueService.getPosition(
        userEmail,
        flashSale.item._id
      );
      if (position.size > 0) {
        setQueueStatus(position);
      }
    } catch (error) {
      // User not in queue, which is fine
      setQueueStatus(null);
    }
  }; // Fetch flash sale on email set and periodically

  /// TODO: implement notifs to replace this
  useEffect(() => {
    if (userEmail) {
      fetchFlashSale();
      checkQueueStatus();
      const interval = setInterval(fetchFlashSale, 30000); // Refresh every 30 seconds // Return the cleanup function when userEmail is present
      return () => clearInterval(interval);
    } // Explicitly return void/undefined for the false path to satisfy strict TypeScript
    return;
  }, [userEmail]); // Check queue status when flash sale data changes

  useEffect(() => {
    if (userEmail && flashSale?.item?._id) {
      checkQueueStatus();
    }
  }, [userEmail, flashSale?.item?._id]);

  const handleEmailSubmit = (email: string) => {
    setUserEmail(email);
    storageUtil.setUserEmail(email);
    setShowEmailPrompt(false);
    toast.success('Welcome! Loading flash sales...');
  };

  const handleBuyClick = (position: QueuePosition) => {
    setQueueStatus(position);
  };

  const handleCountdownComplete = () => {
    setCountdownCompleted(true);
    setForceUpdate(prev => prev + 1); // Force re-render
    // Refresh flash sale data to get updated status
    fetchFlashSale();
    toast.success('🎉 Flash sale is now live!');
  };

  const clearEmail = () => {
    storageUtil.clearUserEmail();
    setUserEmail('');
    setQueueStatus(null);
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
                      onCountdownComplete={handleCountdownComplete}
                    />
                  )}
                {/* Show flash sale card */}
                <FlashSaleCard
                  item={flashSale.item}
                  meta={flashSale.meta}
                  userEmail={userEmail}
                  queueStatus={queueStatus}
                  onBuy={handleBuyClick}
                  countdownCompleted={countdownCompleted}
                  key={`${flashSale.item?._id}-${countdownCompleted}-${forceUpdate}`}
                />
                {/* Show queue status if user is in queue */}
                {queueStatus && queueStatus.size > 0 && flashSale.item && (
                  <QueueStatus
                    userEmail={userEmail}
                    flashSaleId={flashSale.item._id}
                    flashSale={flashSale}
                    initialPosition={queueStatus}
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
            {/* User Orders Section */}
            <UserOrders userEmail={userEmail} />
          </Space>
        )}
      </Content>
    </Layout>
  );
}
