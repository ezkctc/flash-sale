'use client';

import React, { useState, useEffect } from 'react';
import { Card, Statistic, Row, Col, Typography } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface CountdownTimerProps {
  targetDate: string;
  title: string;
}

export function CountdownTimer({ targetDate, title }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(targetDate).getTime() - new Date().getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <Card
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: 16,
        color: 'white',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <ClockCircleOutlined style={{ fontSize: 48, marginBottom: 16 }} />
        <Title level={2} style={{ color: 'white', marginBottom: 8 }}>
          {title}
        </Title>
      </div>
      
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none' }}>
            <Statistic
              value={timeLeft.days}
              suffix="Days"
              valueStyle={{ color: 'white', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none' }}>
            <Statistic
              value={timeLeft.hours}
              suffix="Hours"
              valueStyle={{ color: 'white', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none' }}>
            <Statistic
              value={timeLeft.minutes}
              suffix="Minutes"
              valueStyle={{ color: 'white', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none' }}>
            <Statistic
              value={timeLeft.seconds}
              suffix="Seconds"
              valueStyle={{ color: 'white', fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );
}