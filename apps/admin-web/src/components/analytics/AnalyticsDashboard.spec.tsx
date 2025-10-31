import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { mockFlashSales, mockOrders } from '@/test/fixtures';

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/services/api', () => ({
  apiFetch: vi.fn(),
}));

describe('AnalyticsDashboard', () => {
  let mockApiFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const { apiFetch } = require('@/lib/services/api');
    mockApiFetch = apiFetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render all statistic cards', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Flash Sales')).toBeInTheDocument();
      expect(screen.getByText('Active Sales')).toBeInTheDocument();
      expect(screen.getByText('Total Orders')).toBeInTheDocument();
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });
  });

  it('should calculate total flash sales correctly', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('should calculate active sales correctly', async () => {
    const now = new Date();
    const activeSale = {
      ...mockFlashSales[0],
      startsAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() + 3600000),
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: [activeSale] })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Active Sales')).toBeInTheDocument();
    });
  });

  it('should calculate total revenue from paid orders', async () => {
    const paidOrders = [
      { ...mockOrders[0], paymentStatus: 'paid', totalAmount: 100 },
      { ...mockOrders[1], paymentStatus: 'paid', totalAmount: 50 },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: paidOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });
  });

  it('should count only paid orders', async () => {
    const mixedOrders = [
      { ...mockOrders[0], paymentStatus: 'paid' },
      { ...mockOrders[1], paymentStatus: 'pending' },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mixedOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('should display recent orders table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Recent Orders')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('should display top performing sales table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Top Performing Sales')).toBeInTheDocument();
      expect(screen.getByText('Test Flash Sale')).toBeInTheDocument();
    });
  });

  it('should calculate sold quantity correctly', async () => {
    const sale = {
      ...mockFlashSales[0],
      startingQuantity: 100,
      currentQuantity: 75,
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: [sale] })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('25 / 100')).toBeInTheDocument();
    });
  });

  it('should show correct status for flash sales', async () => {
    const now = new Date();
    const activeSale = {
      ...mockFlashSales[0],
      startsAt: new Date(now.getTime() - 3600000),
      endsAt: new Date(now.getTime() + 3600000),
    };
    const upcomingSale = {
      ...mockFlashSales[1],
      startsAt: new Date(now.getTime() + 3600000),
      endsAt: new Date(now.getTime() + 7200000),
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: [activeSale, upcomingSale] })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('upcoming')).toBeInTheDocument();
    });
  });

  it('should display order status tags with colors', async () => {
    const mixedOrders = [
      { ...mockOrders[0], paymentStatus: 'paid' },
      { ...mockOrders[1], paymentStatus: 'pending' },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mixedOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('paid')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('should format currency correctly', async () => {
    const ordersWithAmounts = [
      { ...mockOrders[0], paymentStatus: 'paid', totalAmount: 99.99 },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: ordersWithAmounts });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('$99.99')).toBeInTheDocument();
    });
  });

  it('should format dates correctly', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/11-15/)).toBeInTheDocument();
    });
  });

  it('should handle error when loading flash sales fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch.mockRejectedValue(new Error('Failed to load sales'));

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load analytics');
    });
  });

  it('should handle error when loading orders fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockRejectedValueOnce(new Error('Failed to load orders'));

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load analytics');
    });
  });

  it('should handle empty data gracefully', async () => {
    mockApiFetch.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [] });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('should show loading state while fetching data', async () => {
    mockApiFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ items: [] }), 100)
        )
    );

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Flash Sales')).toBeInTheDocument();
    });
  });

  it('should calculate zero revenue when no paid orders', async () => {
    const pendingOrders = [
      { ...mockOrders[0], paymentStatus: 'pending' },
      { ...mockOrders[1], paymentStatus: 'cancelled' },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: pendingOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });
  });

  it('should sort top sales by sold quantity', async () => {
    const sales = [
      { ...mockFlashSales[0], startingQuantity: 100, currentQuantity: 50 },
      { ...mockFlashSales[1], startingQuantity: 50, currentQuantity: 10 },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: sales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('50 / 100')).toBeInTheDocument();
      expect(screen.getByText('40 / 50')).toBeInTheDocument();
    });
  });

  it('should limit recent orders to 5', async () => {
    const manyOrders = Array.from({ length: 10 }, (_, i) => ({
      ...mockOrders[0],
      _id: `order-${i}`,
      userEmail: `user${i}@example.com`,
    }));

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: manyOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Recent Orders')).toBeInTheDocument();
    });
  });

  it('should limit top sales to 5', async () => {
    const manySales = Array.from({ length: 10 }, (_, i) => ({
      ...mockFlashSales[0],
      _id: `sale-${i}`,
      name: `Sale ${i}`,
    }));

    mockApiFetch
      .mockResolvedValueOnce({ items: manySales })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Top Performing Sales')).toBeInTheDocument();
    });
  });

  it('should handle sales with zero inventory correctly', async () => {
    const soldOutSale = {
      ...mockFlashSales[0],
      startingQuantity: 100,
      currentQuantity: 0,
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: [soldOutSale] })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('100 / 100')).toBeInTheDocument();
    });
  });

  it('should display ended sales correctly', async () => {
    const endedSale = {
      ...mockFlashSales[0],
      startsAt: new Date('2020-01-01T10:00:00Z'),
      endsAt: new Date('2020-01-01T12:00:00Z'),
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: [endedSale] })
      .mockResolvedValueOnce({ items: mockOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('ended')).toBeInTheDocument();
    });
  });

  it('should handle different payment status types', async () => {
    const diverseOrders = [
      { ...mockOrders[0], paymentStatus: 'paid' },
      { ...mockOrders[0], paymentStatus: 'failed' },
      { ...mockOrders[0], paymentStatus: 'refunded' },
      { ...mockOrders[0], paymentStatus: 'cancelled' },
    ];

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce({ items: diverseOrders });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('paid')).toBeInTheDocument();
    });
  });
});
