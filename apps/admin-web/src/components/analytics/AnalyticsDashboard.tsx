'use client';

import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import {
  ShoppingCartOutlined,
  UserOutlined,
  DollarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import { apiFetch } from '@/lib/services/api';
import { FlashSaleShape } from '@flash-sale/shared-types';

interface AnalyticsData {
  totalSales: number;
  totalOrders: number;
  activeSales: number;
  recentOrders: any[];
  topSales: FlashSaleShape[];
  timeToNextSale: string;
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData>({
    totalSales: 0,
    totalOrders: 0,
    activeSales: 0,
    recentOrders: [],
    topSales: [],
    timeToNextSale: 'N/A',
  });
  const [loading, setLoading] = useState(false);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Load flash sales
      const salesResponse = await apiFetch<{ items: FlashSaleShape[] }>(
        '/flash-sales'
      );
      const sales = salesResponse.items;

      // Load recent orders
      const ordersResponse = await apiFetch<{ items: any[] }>(
        '/orders/admin/list-admin?limit=10'
      );
      const orders = ordersResponse.items;

      // Calculate analytics
      const now = new Date();
      const activeSales = sales.filter((sale) => {
        const start = new Date(sale.startsAt);
        const end = new Date(sale.endsAt);
        return start <= now && now <= end;
      }).length;

      // Time to next sale (next upcoming by startsAt)
      const upcoming = sales
        .map((s) => ({ ...s, starts: new Date(s.startsAt) }))
        .filter((s) => s.starts > now)
        .sort((a, b) => a.starts.getTime() - b.starts.getTime());

      const formatDuration = (ms: number) => {
        if (ms <= 0) return '0m 0s';
        const totalSeconds = Math.floor(ms / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        return `${minutes}m ${seconds}s`;
      };

      const timeToNextSale = upcoming.length
        ? formatDuration(upcoming[0].starts.getTime() - now.getTime())
        : 'N/A';

      const paidOrders = orders.filter(
        (order) => order.paymentStatus === 'paid'
      ).length;

      // Top sales by sold quantity
      const topSales = sales
        .map((sale) => ({
          ...sale,
          soldQuantity:
            (sale.startingQuantity || 0) - (sale.currentQuantity || 0),
        }))
        .sort((a, b) => b.soldQuantity - a.soldQuantity)
        .slice(0, 5);

      setData({
        totalSales: sales.length,
        totalOrders: paidOrders,
        activeSales,
        recentOrders: orders.slice(0, 5),
        topSales,
        timeToNextSale,
      });
    } catch (error: any) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const orderColumns = [
    {
      title: 'Order ID',
      dataIndex: '_id',
      key: '_id',
      render: (id: string) => (
        <span className="font-mono text-xs">{id.toString()}</span>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'userEmail',
      key: 'userEmail',
    },
    {
      title: 'Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (status: string) => {
        const color =
          {
            pending: 'orange',
            paid: 'green',
            failed: 'red',
            refunded: 'purple',
            cancelled: 'gray',
          }[status] || 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount: number) => `$${(amount || 0).toFixed(2)}`,
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('MM-DD HH:mm'),
    },
  ];

  const salesColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Sold',
      key: 'sold',
      render: (_: any, record: any) => (
        <span>
          {record.soldQuantity} / {record.startingQuantity}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, record: FlashSaleShape) => {
        const now = new Date();
        const start = new Date(record.startsAt);
        const end = new Date(record.endsAt);

        let status = 'upcoming';
        let color = 'blue';

        if (start <= now && now <= end) {
          status = 'active';
          color = 'green';
        } else if (now > end) {
          status = 'ended';
          color = 'gray';
        }

        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Period',
      key: 'period',
      render: (_: any, record: FlashSaleShape) => (
        <span className="text-xs">
          {dayjs(record.startsAt).format('MM-DD HH:mm')} -{' '}
          {dayjs(record.endsAt).format('MM-DD HH:mm')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Flash Sales"
              value={data.totalSales}
              prefix={<ShoppingCartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Sales"
              value={data.activeSales}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Orders"
              value={data.totalOrders}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Time to Next Sale"
              value={data.timeToNextSale}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Recent Orders" size="small">
            <Table
              rowKey={(record) => record._id?.toString() || ''}
              columns={orderColumns}
              dataSource={data.recentOrders}
              pagination={false}
              size="small"
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Top Performing Sales" size="small">
            <Table
              rowKey={(record) => record._id?.toString() || ''}
              columns={salesColumns}
              dataSource={data.topSales}
              pagination={false}
              size="small"
              loading={loading}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
