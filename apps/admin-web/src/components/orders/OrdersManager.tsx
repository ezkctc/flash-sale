'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Input,
  Select,
  DatePicker,
} from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import { apiFetch } from '@/lib/services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface Order {
  _id: string;
  userEmail: string;
  flashSaleId: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    userEmail: '',
    flashSaleId: '',
    paymentStatus: '',
    dateRange: null as any,
  });

  const loadOrders = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      });

      if (filters.userEmail) params.append('userEmail', filters.userEmail);
      if (filters.flashSaleId)
        params.append('flashSaleId', filters.flashSaleId);

      const response = await apiFetch<{
        items: Order[];
        total: number;
        page: number;
        limit: number;
      }>(`/orders/admin/list-admin?${params}`);

      setOrders(response.items);
      setPagination({
        current: response.page,
        pageSize: response.limit,
        total: response.total,
      });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const columns = useMemo(
    () => [
      {
        title: 'Order ID',
        dataIndex: '_id',
        key: '_id',
        width: 120,
        render: (id: string) => (
          <span className="font-mono text-xs">{id.toString()}</span>
        ),
      },
      {
        title: 'User Email',
        dataIndex: 'userEmail',
        key: 'userEmail',
        width: 200,
      },
      {
        title: 'Flash Sale ID',
        dataIndex: 'flashSaleId',
        key: 'flashSaleId',
        width: 120,
        render: (id: string) => (
          <span className="font-mono text-xs">{id.toString() || 'N/A'}</span>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'paymentStatus',
        key: 'paymentStatus',
        width: 100,
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
        width: 100,
        render: (amount: number) => `$${(amount || 0).toFixed(2)}`,
      },
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 150,
        render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
      },
    ],
    []
  );

  const handleTableChange = (paginationInfo: any) => {
    loadOrders(paginationInfo.current, paginationInfo.pageSize);
  };

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    loadOrders(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({
      userEmail: '',
      flashSaleId: '',
      paymentStatus: '',
      dateRange: null,
    });
    setPagination((prev) => ({ ...prev, current: 1 }));
    loadOrders(1, pagination.pageSize);
  };

  return (
    <Card
      title="Orders Management"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => loadOrders()}>
          Refresh
        </Button>
      }
    >
      <div className="mb-4">
        <Space wrap>
          <Input
            placeholder="Search by email"
            value={filters.userEmail}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, userEmail: e.target.value }))
            }
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
          />
          <Input
            placeholder="Flash Sale ID"
            value={filters.flashSaleId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, flashSaleId: e.target.value }))
            }
            style={{ width: 150 }}
          />
          <Select
            placeholder="Payment Status"
            value={filters.paymentStatus || undefined}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, paymentStatus: value || '' }))
            }
            style={{ width: 150 }}
            allowClear
          >
            <Option value="pending">Pending</Option>
            <Option value="paid">Paid</Option>
            <Option value="failed">Failed</Option>
            <Option value="refunded">Refunded</Option>
            <Option value="cancelled">Cancelled</Option>
          </Select>
          <Button type="primary" onClick={handleSearch}>
            Search
          </Button>
          <Button onClick={handleReset}>Reset</Button>
        </Space>
      </div>

      <Table
        rowKey={(record) => record._id?.toString() || ''}
        columns={columns}
        dataSource={orders}
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} of ${total} orders`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 800 }}
      />
    </Card>
  );
}
