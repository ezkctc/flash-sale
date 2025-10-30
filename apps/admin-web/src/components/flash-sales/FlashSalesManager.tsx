'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import {
  listFlashSales,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
} from '@/lib/services/flash-sales';
import { FlashSaleForm } from './FlashSaleForm';
import { FlashSaleShape } from '@flash-sale/shared-types';

export function FlashSalesManager() {
  const [items, setItems] = useState<FlashSaleShape[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FlashSaleShape | null>(null);
  const [formValues, setFormValues] = useState<any>({});

  async function load() {
    setLoading(true);
    try {
      const { items } = await listFlashSales();

      setItems(items);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load flash sales');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(
    () => [
      { title: 'Name', dataIndex: 'name', key: 'name' },
      {
        title: 'Window',
        key: 'window',
        render: (_: any, r: FlashSaleShape) => (
          <span>
            {dayjs(r.startsAt).format('YYYY-MM-DD HH:mm')} →{' '}
            {dayjs(r.endsAt).format('YYYY-MM-DD HH:mm')}
          </span>
        ),
      },
      {
        title: 'Inventory',
        key: 'inv',
        render: (_: any, r: FlashSaleShape) => (
          <span>
            {r.currentQuantity ?? 0} / {r.startingQuantity ?? 0}
          </span>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <Tag>{s || 'n/a'}</Tag>,
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: any, r: FlashSaleShape) => (
          <Space>
            <Button size="small" onClick={() => openEdit(r)}>
              Edit
            </Button>
            <Button size="small" danger onClick={() => handleDelete(r)}>
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    []
  );

  function openCreate() {
    setEditing(null);
    setFormValues({});
    setModalOpen(true);
  }
  function openEdit(r: FlashSaleShape) {
    setEditing(r);
    setFormValues({});
    setModalOpen(true);
  }

  async function handleOk() {
    try {
      const basePayload = {
        name: formValues.name,
        description: formValues.description,
        startsAt: dayjs(formValues.startsAt).toISOString(),
        endsAt: dayjs(formValues.endsAt).toISOString(),
        startingQuantity: Number(formValues.startingQuantity ?? 0),
        currentQuantity: Number(formValues.currentQuantity ?? 0),
        status: editing?.status,
      };

      // For new flash sales, use the form values
      // For editing, both quantities can be increased
      const payload: FlashSaleShape = basePayload as unknown as FlashSaleShape;

      if (editing?._id) {
        await updateFlashSale(editing._id, payload);
        toast.success('Updated');
      } else {
        await createFlashSale(payload);
        toast.success('Created');
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    }
  }

  async function handleDelete(r: FlashSaleShape) {
    Modal.confirm({
      title: 'Delete flash sale?',
      content: `This will delete ${r.name}.`,
      okType: 'danger',
      onOk: async () => {
        try {
          if (r._id) await deleteFlashSale(r._id);
          toast.success('Deleted');
          await load();
        } catch (e: any) {
          toast.error(e?.message || 'Failed to delete');
        }
      },
    });
  }

  return (
    <Card
      title="Flash Sales"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New
        </Button>
      }
    >
      <Table
        rowKey={(r) => r?._id?.toString() ?? ''}
        columns={columns as any}
        dataSource={items}
        loading={loading}
      />

      <Modal
        title={editing ? 'Edit Flash Sale' : 'New Flash Sale'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <FlashSaleForm initial={editing} onChange={setFormValues} />
      </Modal>
    </Card>
  );
}
