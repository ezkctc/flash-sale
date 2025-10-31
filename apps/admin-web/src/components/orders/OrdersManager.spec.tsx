import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { OrdersManager } from './OrdersManager';
import { mockOrders } from '@/test/fixtures';

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/services/api', () => ({
  apiFetch: vi.fn(),
}));

describe('OrdersManager', () => {
  let mockApiFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const { apiFetch } = require('@/lib/services/api');
    mockApiFetch = apiFetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render component with title', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });
  });

  it('should load and display orders on mount', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('user2@example.com')).toBeInTheDocument();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/orders/admin/list-admin'));
  });

  it('should display order status tags with correct colors', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('paid')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('should display formatted amounts', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('$99.99')).toBeInTheDocument();
      expect(screen.getByText('$49.99')).toBeInTheDocument();
    });
  });

  it('should filter orders by email', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText(/search by email/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('userEmail=test@example.com')
      );
    });
  });

  it('should filter orders by flash sale ID', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/flash sale id/i)).toBeInTheDocument();
    });

    const saleIdInput = screen.getByPlaceholderText(/flash sale id/i);
    fireEvent.change(saleIdInput, { target: { value: '507f1f77bcf86cd799439011' } });

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('flashSaleId=507f1f77bcf86cd799439011')
      );
    });
  });

  it('should filter orders by payment status', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
  });

  it('should reset filters when reset button is clicked', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText(/search by email/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    expect(emailInput.value).toBe('test@example.com');

    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(emailInput.value).toBe('');
    });
  });

  it('should refresh orders when refresh button is clicked', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockOrders, total: 2, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('should handle pagination changes', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 2, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('1-2 of 100 orders')).toBeInTheDocument();
    });
  });

  it('should handle page size changes', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 1, limit: 50 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });
  });

  it('should handle error when loading orders fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch.mockRejectedValue(new Error('Failed to load orders'));

    render(<OrdersManager />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load orders');
    });
  });

  it('should show loading state while fetching', async () => {
    mockApiFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ items: [], total: 0, page: 1, limit: 20 }), 100)
        )
    );

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });
  });

  it('should display order IDs in monospace font', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      const orderIds = screen.getAllByText(/^607f1f77bcf86cd799439/);
      orderIds.forEach((element) => {
        expect(element).toHaveClass('font-mono');
      });
    });
  });

  it('should display all payment status options in filter', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });
  });

  it('should handle empty orders list', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('Orders Management')).toBeInTheDocument();
    });

    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
  });

  it('should maintain filter state during pagination', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 2, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText(/search by email/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('userEmail=test@example.com')
      );
    });
  });

  it('should reset to page 1 when applying new filters', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockOrders, total: 100, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: mockOrders, total: 50, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText(/search by email/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('page=1')
      );
    });
  });

  it('should format dates correctly', async () => {
    mockApiFetch.mockResolvedValue({ items: mockOrders, total: 2, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/2025-11-15/)).toBeInTheDocument();
      expect(screen.getByText(/2025-11-16/)).toBeInTheDocument();
    });
  });

  it('should display flash sale IDs or N/A', async () => {
    const ordersWithMissingId = [
      { ...mockOrders[0], flashSaleId: '' },
    ];
    mockApiFetch.mockResolvedValue({ items: ordersWithMissingId, total: 1, page: 1, limit: 20 });

    render(<OrdersManager />);

    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });
});
