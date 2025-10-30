'use client';

import React, { useState } from 'react';
import { Card, Button, Progress, Typography, Space, Tag, Spin } from 'antd';
import {
  ShoppingCartOutlined,
  FireOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { toast } from 'react-toastify';

const { Title, Text } = Typography;

interface FlashSaleItem {
  _id: string;
  name: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  currentQuantity: number;
  startingQuantity: number;
}

interface FlashSaleMeta {
  status: 'ongoing' | 'upcoming' | 'ended' | 'not_found';
  soldOut: boolean;
  progress?: {
    remaining: number;
    starting: number;
    ratio: number;
  };
  startsAt?: string;
  endsAt?: string;
}

interface FlashSaleCardProps {
  item: FlashSaleItem | null;
  meta: FlashSaleMeta;
  userEmail: string;
  onBuy: () => void;
}

export function FlashSaleCard({
  item,
  meta,
  userEmail,
  onBuy,
}: FlashSaleCardProps) {
  const [buying, setBuying] = useState(false);

  if (!item) {
    return (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <Title level={3}>No Flash Sale Available</Title>
        <Text type="secondary">Check back later for exciting deals!</Text>
      </Card>
    );
  }

  const handleBuy = async () => {
    setBuying(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

      console.log('Sending buy request:', {
        email: userEmail,
        flashSaleId: item._id,
      });

      const response = await fetch(`${apiUrl}/orders/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          flashSaleId: item._id,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to place order';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message;
        } catch {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.hasActiveHold) {
        toast.success(
          `You already have a reservation! Hold expires in ${Math.floor(
            result.holdTtlSec / 60
          )} minutes.`
        );
      } else {
        toast.success(
          `Added to queue! You are position #${result.position} of ${result.size}`
        );
      }

      onBuy();
    } catch (error: any) {
      console.error('Buy request failed:', error);
      toast.error(error.message || 'Failed to place order');
    } finally {
      setBuying(false);
    }
  };

  const getStatusTag = () => {
    switch (meta.status) {
      case 'ongoing':
        return (
          <Tag color="green" icon={<FireOutlined />}>
            LIVE NOW
          </Tag>
        );
      case 'upcoming':
        return <Tag color="blue">UPCOMING</Tag>;
      case 'ended':
        return <Tag color="gray">ENDED</Tag>;
      default:
        return null;
    }
  };

  const progressPercent = meta.progress
    ? Math.round((1 - meta.progress.ratio) * 100)
    : 0;

  const soldCount = meta.progress
    ? meta.progress.starting - meta.progress.remaining
    : 0;

  return (
    <Card
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Space direction="vertical" size="small">
          {getStatusTag()}
          <Title level={2} style={{ margin: 0 }}>
            {item.name}
          </Title>
          {item.description && (
            <Text type="secondary" style={{ fontSize: 16 }}>
              {item.description}
            </Text>
          )}
        </Space>
      </div>

      {meta.progress && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <Text strong>Progress</Text>
            <Text>
              {soldCount} / {meta.progress.starting} sold
            </Text>
          </div>
          <Progress
            percent={progressPercent}
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
            trailColor="#f0f0f0"
            strokeWidth={12}
            showInfo={false}
          />
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text type="secondary">{meta.progress.remaining} remaining</Text>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        {meta.status === 'ongoing' && !meta.soldOut ? (
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={handleBuy}
            loading={buying}
            style={{
              height: 50,
              fontSize: 16,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
            }}
            block
          >
            {buying ? 'Adding to Queue...' : 'Buy Now'}
          </Button>
        ) : meta.soldOut ? (
          <Button
            size="large"
            disabled
            style={{ height: 50, fontSize: 16, borderRadius: 8 }}
            block
          >
            Sold Out
          </Button>
        ) : meta.status === 'ended' ? (
          <Button
            size="large"
            disabled
            style={{ height: 50, fontSize: 16, borderRadius: 8 }}
            block
          >
            Sale Ended
          </Button>
        ) : (
          <Button
            size="large"
            disabled
            style={{ height: 50, fontSize: 16, borderRadius: 8 }}
            block
          >
            Coming Soon
          </Button>
        )}
      </div>

      {meta.status === 'ongoing' && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Sale ends: {new Date(meta.endsAt!).toLocaleString()}
          </Text>
        </div>
      )}
    </Card>
  );
}
