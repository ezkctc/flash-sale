'use client';

import React, { useState, useEffect } from 'react';
import { Card, Typography, Space, Tag, Button, Spin } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';

import type { QueuePosition, FlashSaleResponse } from '@/types';
import { queueService } from '@/services';
import { timeUtil } from '@/utils';

const { Title, Text } = Typography;

interface QueueStatusProps {
  userEmail: string;
  flashSaleId: string;
  flashSale: FlashSaleResponse;
  initialPosition: QueuePosition;
}

export function QueueStatus({ userEmail, flashSaleId, flashSale, initialPosition }: QueueStatusProps) {
  const [position, setPosition] = useState<QueuePosition | null>(initialPosition);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fetchPosition = async () => {
    setLoading(true);
    try {
      const data = await queueService.getPosition(userEmail, flashSaleId);
      setPosition(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch queue position');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    setConfirming(true);
    try {
      const result = await queueService.confirmPayment(userEmail, flashSaleId, 1);

      toast.success(`Payment confirmed! Order ID: ${result.orderId}`);
      fetchPosition(); // Refresh status
    } catch (error: any) {
      if (error.message.includes('expired')) {
        toast.error('Your reservation has expired. Please try again.');
      } else if (error.message.includes('Sold out')) {
        toast.error('Sorry, the item is now sold out.');
      } else {
        toast.error(error.message || 'Failed to confirm payment');
      }
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    fetchPosition();
    const interval = setInterval(fetchPosition, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [userEmail, flashSaleId]);

  if (loading && !position) {
    return (
      <Card style={{ textAlign: 'center', padding: 20 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>Checking your queue status...</Text>
        </div>
      </Card>
    );
  }

  if (!position || position.size === 0) {
    return null;
  }

  const holdMinutes = Math.floor(position.holdTtlSec / 60);
  const holdSeconds = position.holdTtlSec % 60;
  const holdTimeFormatted = timeUtil.formatDuration(position.holdTtlSec);

  // Check if user can purchase based on position vs remaining inventory
  const canPurchase = position.position && 
    flashSale.meta.progress && 
    position.position <= flashSale.meta.progress.remaining;

  return (
    <Card
      style={{
        marginTop: 24,
        borderRadius: 16,
        background: position.hasActiveHold 
          ? 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)'
          : canPurchase 
            ? 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)'
            : 'linear-gradient(135deg, #faad14 0%, #ffc53d 100%)',
        border: 'none',
        color: 'white',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {position.hasActiveHold ? (
            <>
              <CheckCircleOutlined style={{ fontSize: 48 }} />
              <div>
                <Title level={3} style={{ color: 'white', margin: 0 }}>
                  Reservation Confirmed!
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16 }}>
                  You have {holdTimeFormatted} to complete your purchase
                </Text>
              </div>
              <Button
                type="primary"
                size="large"
                onClick={handleConfirmPayment}
                loading={confirming}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  height: 50,
                  fontSize: 16,
                }}
              >
                {confirming ? 'Processing Payment...' : 'Confirm Payment ($1.00)'}
              </Button>
            </>
          ) : canPurchase ? (
            <>
              <CheckCircleOutlined style={{ fontSize: 48 }} />
              <div>
                <Title level={3} style={{ color: 'white', margin: 0 }}>
                  Ready to Purchase!
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16 }}>
                  Position #{position.position} of {position.size} - You can buy this item!
                </Text>
              </div>
              <Button
                type="primary"
                size="large"
                onClick={handleConfirmPayment}
                loading={confirming}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  height: 50,
                  fontSize: 16,
                }}
              >
                {confirming ? 'Processing Payment...' : 'Pay Now ($1.00)'}
              </Button>
            </>
          ) : (
            <>
              <ClockCircleOutlined style={{ fontSize: 48 }} />
              <div>
                <Title level={3} style={{ color: 'white', margin: 0 }}>
                  Waiting in Queue
                </Title>
                {position.position ? (
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16 }}>
                    Position #{position.position} of {position.size} - Not enough inventory yet
                  </Text>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16 }}>
                    Processing your request...
                  </Text>
                )}
              </div>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchPosition}
                loading={loading}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                }}
              >
                Refresh Status
              </Button>
            </>
          )}
        </Space>
      </div>
    </Card>
  );
}