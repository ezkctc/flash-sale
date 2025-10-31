'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Space, Button, Empty } from 'antd';
import { ReloadOutlined, ShoppingOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';

import type { Order } from '@/types';
import { orderService } from '@/services';

const { Title, Text } = Typography;

interface UserOrdersProps {
  userEmail: string;
}

export function UserOrders({ userEmail }: UserOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  const loadOrders = async (page = 1, pageSize = 10) => {
    if (!userEmail) return;

    setLoading(true);
    try {
      const response = await orderService.getOrdersByEmail(
        userEmail,
        page,
        pageSize
      );

      setOrders(response.items);
      setPagination({
        current: response.page,
        pageSize: response.limit,
        total: response.total,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [userEmail]);

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'orange',
      paid: 'green',
      failed: 'red',
      refunded: 'purple',
      cancelled: 'gray',
    };
    return colors[status as keyof typeof colors] || 'default';
  };

  const columns = [
    {
      title: 'Order ID',
      dataIndex: '_id',
      key: '_id',
      width: 120,
      render: (id: string) => (
        <Text code style={{ fontSize: 12 }}>
          {id.toString().slice(-8)}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 100,
      render: (amount: number) => (
        <Text strong>${(amount || 0).toFixed(2)}</Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date: string) => (
        <Text>{dayjs(date).format('MMM DD, YYYY HH:mm')}</Text>
      ),
    },
    {
      title: 'Flash Sale',
      dataIndex: 'flashSaleName',
      key: 'flashSaleName',
      render: (name: string) => (
        <Text code style={{ fontSize: 12 }}>
          {name ? name : 'N/A'}
        </Text>
      ),
    },
  ];

  const handleTableChange = (paginationInfo: any) => {
    loadOrders(paginationInfo.current, paginationInfo.pageSize);
  };

  return (
    <Card
      title={
        <Space>
          <ShoppingOutlined />
          <Title level={4} style={{ margin: 0 }}>
            My Orders
          </Title>
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => loadOrders()}
          loading={loading}
          size="small"
        >
          Refresh
        </Button>
      }
      style={{ marginTop: 24 }}
    >
      {orders.length === 0 && !loading ? (
        <Empty
          description="No orders found"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            Your order history will appear here after making purchases
          </Text>
        </Empty>
      ) : (
        <Table
          rowKey={(record: Order) =>
            record._id?.toString?.() ??
            `${record.userEmail}-${record.createdAt}`
          }
          columns={columns}
          dataSource={orders}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: false,
            showQuickJumper: false,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} orders`,
            size: 'small',
          }}
          onChange={handleTableChange}
          size="small"
          scroll={{ x: 600 }}
        />
      )}
    </Card>
  );
}
