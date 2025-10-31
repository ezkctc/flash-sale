'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Select,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';
import { apiFetch } from '@/lib/services/api';
import { FlashSaleShape } from '@flash-sale/shared-types';

const { Option } = Select;

interface QueueMember {
  email: string;
  position: number;
  score: number;
  holdTtlSec: number;
}

interface QueueOverview {
  queueName: string;
  jobCounts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  lineSize: number;
  flashSaleId: string;
  ts: number;
}

export function QueueMonitor() {
  const [flashSales, setFlashSales] = useState<FlashSaleShape[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [overview, setOverview] = useState<QueueOverview | null>(null);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audit, setAudit] = useState<{
    ts: number;
    queueName: string;
    flashSaleId: string;
    head: QueueMember[];
    holds: Array<{
      key: string;
      email: string;
      ttlSec: number;
      inQueue: boolean;
    }>;
    otherQueues: Array<{ saleId: string; size: number }>;
    strays: QueueMember[];
  } | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });

  // Load flash sales for selection
  useEffect(() => {
    const loadFlashSales = async () => {
      try {
        const response = await apiFetch<{ items: FlashSaleShape[] }>(
          '/flash-sales'
        );
        setFlashSales(response.items);
        if (response.items.length > 0 && !selectedSaleId) {
          setSelectedSaleId(response.items[0]._id?.toString() || '');
        }
      } catch (error: any) {
        toast.error('Failed to load flash sales');
      }
    };
    loadFlashSales();
  }, []);

  // Load queue overview
  const loadOverview = async () => {
    if (!selectedSaleId) return;

    setLoading(true);
    try {
      const response = await apiFetch<QueueOverview>(
        `/orders/admin/queue/overview?flashSaleId=${selectedSaleId}`
      );
      setOverview(response);
    } catch (error: any) {
      toast.error('Failed to load queue overview');
    } finally {
      setLoading(false);
    }
  };

  // Load queue members
  const loadMembers = async (page = 1, pageSize = 50) => {
    if (!selectedSaleId) return;

    setMembersLoading(true);
    try {
      const response = await apiFetch<{
        items: QueueMember[];
        total: number;
        page: number;
        limit: number;
      }>(
        `/orders/admin/queue/members?flashSaleId=${selectedSaleId}&page=${page}&limit=${pageSize}`
      );

      setMembers(response.items);
      setPagination({
        current: response.page,
        pageSize: response.limit,
        total: response.total,
      });
    } catch (error: any) {
      toast.error('Failed to load queue members');
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSaleId) {
      loadOverview();
      loadMembers();
    }
  }, [selectedSaleId]);

  const columns = [
    {
      title: 'Position',
      dataIndex: 'position',
      key: 'position',
      width: 80,
      render: (pos: number) => <Tag color="blue">#{pos}</Tag>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 250,
    },
    {
      title: 'Enqueued At',
      dataIndex: 'score',
      key: 'score',
      width: 150,
      render: (score: number) => new Date(score).toLocaleString(),
    },
    {
      title: 'Hold Status',
      dataIndex: 'holdTtlSec',
      key: 'holdTtlSec',
      width: 120,
      render: (ttl: number) => {
        if (ttl > 0) {
          const minutes = Math.floor(ttl / 60);
          const seconds = ttl % 60;
          return (
            <Tag color="green">
              {minutes}m {seconds}s
            </Tag>
          );
        }
        return <Tag color="gray">No Hold</Tag>;
      },
    },
  ];

  // Audit loader
  const loadAudit = async () => {
    if (!selectedSaleId) return;
    setAuditLoading(true);
    try {
      const res = await apiFetch(
        `/orders/admin/queue/audit?flashSaleId=${selectedSaleId}&sample=100`
      );
      setAudit(res as any);
    } catch (e: any) {
      toast.error('Failed to load audit');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleTableChange = (paginationInfo: any) => {
    loadMembers(paginationInfo.current, paginationInfo.pageSize);
  };

  return (
    <div className="space-y-6">
      <Card title="Queue Monitor">
        <div className="mb-4">
          <Space>
            <span>Flash Sale:</span>
            <Select
              style={{ width: 300 }}
              value={selectedSaleId}
              onChange={setSelectedSaleId}
              placeholder="Select a flash sale"
            >
              {flashSales.map((sale) => (
                <Option key={sale._id?.toString()} value={sale._id?.toString()}>
                  {sale.name} ({sale._id?.toString().slice(-8)})
                </Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={loadOverview}>
              Refresh
            </Button>
          </Space>
        </div>

        {overview && (
          <Row gutter={16} className="mb-6">
            <Col span={4}>
              <Statistic
                title="Queue Size"
                value={overview.lineSize}
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Waiting"
                value={overview.jobCounts.waiting}
                valueStyle={{ color: '#faad14' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Active"
                value={overview.jobCounts.active}
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Completed"
                value={overview.jobCounts.completed}
                valueStyle={{ color: '#13c2c2' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Failed"
                value={overview.jobCounts.failed}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="Delayed"
                value={overview.jobCounts.delayed}
                valueStyle={{ color: '#722ed1' }}
              />
            </Col>
          </Row>
        )}
      </Card>

      <Card
        title="Queue Members"
        extra={
          <Button
            icon={<EyeOutlined />}
            onClick={() => loadMembers()}
            loading={membersLoading}
          >
            Refresh Members
          </Button>
        }
      >
        <Table
          rowKey="email"
          columns={columns}
          dataSource={members}
          loading={membersLoading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} members`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 600 }}
        />
      </Card>

      <Card
        title="Audit Snapshot"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadAudit}
              loading={auditLoading}
            >
              Refresh Audit
            </Button>
          </Space>
        }
      >
        <div className="mb-4">
          <Space size={24}>
            <div>
              <strong>Queue:</strong> {audit?.queueName || '—'}
            </div>
            <div>
              <strong>Flash Sale:</strong>{' '}
              {audit?.flashSaleId || selectedSaleId || '—'}
            </div>
            <div>
              <strong>Captured:</strong>{' '}
              {audit?.ts ? new Date(audit.ts).toLocaleString() : '—'}
            </div>
          </Space>
        </div>

        <Divider orientation="left">Head Preview (with Hold TTL)</Divider>
        <Table
          rowKey={(r) => `${r.email}:${r.position}`}
          columns={columns}
          dataSource={audit?.head || []}
          size="small"
          pagination={false}
        />

        <Divider orientation="left">Active Holds</Divider>
        <Table
          rowKey={(r) => r.key}
          columns={[
            { title: 'Email', dataIndex: 'email', key: 'email', width: 240 },
            {
              title: 'TTL',
              dataIndex: 'ttlSec',
              key: 'ttlSec',
              width: 140,
              render: (ttl: number) =>
                ttl > 0 ? <Tag color="green">{ttl}s</Tag> : <Tag>No TTL</Tag>,
            },
            {
              title: 'In Queue',
              dataIndex: 'inQueue',
              key: 'inQueue',
              width: 120,
              render: (b: boolean) =>
                b ? <Tag color="orange">Yes</Tag> : <Tag color="blue">No</Tag>,
            },
            { title: 'Key', dataIndex: 'key', key: 'key' },
          ]}
          dataSource={audit?.holds || []}
          size="small"
          pagination={false}
        />

        <Divider orientation="left">Other Queues</Divider>
        <Table
          rowKey={(r) => r.saleId}
          columns={[
            { title: 'Sale Id', dataIndex: 'saleId', key: 'saleId' },
            { title: 'Size', dataIndex: 'size', key: 'size', width: 120 },
          ]}
          dataSource={audit?.otherQueues || []}
          size="small"
          pagination={false}
        />

        <Divider orientation="left">Strays (In Queue while Holding)</Divider>
        <Table
          rowKey={(r) => `${r.email}:${r.position}`}
          columns={columns}
          dataSource={audit?.strays || []}
          size="small"
          pagination={false}
        />
      </Card>
    </div>
  );
}
