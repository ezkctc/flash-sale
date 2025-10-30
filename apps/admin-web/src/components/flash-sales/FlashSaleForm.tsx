'use client';

import { Form, Input, DatePicker, InputNumber, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;

type Props = {
  initial?: any;
  isEditing?: boolean;
  onChange?: (values: any) => void;
};

export function FlashSaleForm({ initial, onChange, isEditing = false }: Props) {
  const [form] = Form.useForm();

  const now = dayjs();
  const defaultStart = now.add(5, 'minute').second(0);
  const defaultEnd = defaultStart.add(1, 'hour');

  const initialPeriod: [Dayjs, Dayjs] | undefined =
    initial?.startsAt && initial?.endsAt
      ? [dayjs(initial.startsAt), dayjs(initial.endsAt)]
      : [defaultStart, defaultEnd];

  // For editing, use the current starting quantity as minimum
  const minStartingQuantity = isEditing ? (initial?.startingQuantity || 0) : 1;

  const disabledDate = (current: Dayjs) => {
    // Block all calendar dates before today
    return !!current && current.isBefore(now.startOf('day'));
  };

  const disabledTime = (current: Dayjs | null, type: 'start' | 'end') => {
    const period: [Dayjs, Dayjs] | undefined = form.getFieldValue('period');
    const start = period?.[0];

    const clampList = (n: number) => Array.from({ length: n }, (_, i) => i);

    if (!current) return {};

    // For START: if selected date is today, block times earlier than "now"
    if (type === 'start') {
      if (current.isSame(now, 'day')) {
        const h = now.hour();
        const m = now.minute();
        const s = now.second();

        return {
          disabledHours: () => clampList(h),
          disabledMinutes: (selectedHour: number) =>
            selectedHour === h ? clampList(m) : [],
          disabledSeconds: (selectedHour: number, selectedMinute: number) =>
            selectedHour === h && selectedMinute === m ? clampList(s + 1) : [],
        };
      }
      return {};
    }

    // For END: must be >= START (to the second)
    if (type === 'end' && start) {
      if (current.isBefore(start, 'day')) {
        // Whole day is invalid — disable everything
        return {
          disabledHours: () => clampList(24),
          disabledMinutes: () => clampList(60),
          disabledSeconds: () => clampList(60),
        };
      }

      if (current.isSame(start, 'day')) {
        const h = start.hour();
        const m = start.minute();
        const s = start.second();

        return {
          disabledHours: () => clampList(h),
          disabledMinutes: (selectedHour: number) =>
            selectedHour === h ? clampList(m) : [],
          disabledSeconds: (selectedHour: number, selectedMinute: number) =>
            selectedHour === h && selectedMinute === m ? clampList(s) : [],
        };
      }
      return {};
    }

    return {};
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        ...(initial || {}),
        name: initial?.name,
        description: initial?.description,
        period: initialPeriod,
        startingQuantity: initial?.startingQuantity ?? 1,
      }}
      onValuesChange={(_, all) => {
        const period: [Dayjs, Dayjs] | undefined = all.period;
        const startsAt = period?.[0]?.toISOString?.();
        const endsAt = period?.[1]?.toISOString?.();

        onChange?.({
          ...all,
          startsAt,
          endsAt,
        });
      }}
    >
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input placeholder="Sale name" />
      </Form.Item>

      <Form.Item name="description" label="Description">
        <Input.TextArea rows={3} placeholder="Optional" />
      </Form.Item>

      <Form.Item
        name="period"
        label="Schedule"
        rules={[
          { required: true, message: 'Please select start and end time' },
        ]}
      >
        <DatePicker.RangePicker
          showTime={{ format: 'HH:mm:ss' }}
          format="YYYY-MM-DD HH:mm:ss"
          className="w-full"
          allowClear
          disabledDate={disabledDate}
          disabledTime={disabledTime}
        />
      </Form.Item>

      {isEditing && initial?.currentQuantity !== undefined && (
        <Form.Item label="Current Inventory">
          <div style={{ padding: '4px 11px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
            <Text strong>{initial.currentQuantity} remaining</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              (Cannot be modified)
            </Text>
          </div>
        </Form.Item>
      )}

      <Form.Item
        name="startingQuantity"
        label={isEditing ? "Starting Inventory (can only increase)" : "Starting Inventory"}
        rules={[{ required: true }]}
      >
        <InputNumber 
          min={minStartingQuantity} 
          className="w-full"
          placeholder={isEditing ? `Minimum: ${minStartingQuantity}` : "Enter quantity"}
        />
      </Form.Item>

      {isEditing && (
        <Text type="secondary" style={{ fontSize: '12px' }}>
          * Starting inventory can only be increased to add more items to the sale
        </Text>
      )}
    </Form>
  );
}
