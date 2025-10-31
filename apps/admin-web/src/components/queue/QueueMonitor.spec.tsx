import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { QueueMonitor } from './QueueMonitor';
import { mockFlashSales, mockQueueOverview, mockQueueMembers } from '@/test/fixtures';

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/services/api', () => ({
  apiFetch: vi.fn(),
}));

describe('QueueMonitor', () => {
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
    mockApiFetch.mockResolvedValue({ items: [] });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Queue Monitor')).toBeInTheDocument();
    });
  });

  it('should load flash sales on mount', async () => {
    mockApiFetch.mockResolvedValue({ items: mockFlashSales });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/flash-sales');
    });
  });

  it('should display flash sale selection dropdown', async () => {
    mockApiFetch.mockResolvedValue({ items: mockFlashSales });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/flash sale/i)).toBeInTheDocument();
    });
  });

  it('should load queue overview when flash sale is selected', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/orders/admin/queue/overview')
      );
    });
  });

  it('should display queue statistics', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Queue Size')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('should display queue members table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Queue Members')).toBeInTheDocument();
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.getByText('user2@example.com')).toBeInTheDocument();
    });
  });

  it('should show hold status for members with TTL', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/5m 0s/)).toBeInTheDocument();
      expect(screen.getByText('No Hold')).toBeInTheDocument();
    });
  });

  it('should refresh overview when refresh button is clicked', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Queue Monitor')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/orders/admin/queue/overview')
      );
    });
  });

  it('should refresh members when refresh members button is clicked', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 })
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Queue Members')).toBeInTheDocument();
    });

    const refreshMembersButton = screen.getByRole('button', { name: /refresh members/i });
    fireEvent.click(refreshMembersButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/orders/admin/queue/members')
      );
    });
  });

  it('should handle pagination changes', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 100, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('1-2 of 100 members')).toBeInTheDocument();
    });
  });

  it('should load audit snapshot when refresh audit is clicked', async () => {
    const mockAudit = {
      ts: Date.now(),
      queueName: 'test-queue',
      flashSaleId: mockFlashSales[0]._id,
      head: mockQueueMembers,
      holds: [],
      otherQueues: [],
      strays: [],
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 })
      .mockResolvedValueOnce(mockAudit);

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Audit Snapshot')).toBeInTheDocument();
    });

    const refreshAuditButton = screen.getByRole('button', { name: /refresh audit/i });
    fireEvent.click(refreshAuditButton);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/orders/admin/queue/audit')
      );
    });
  });

  it('should display audit sections', async () => {
    const mockAudit = {
      ts: Date.now(),
      queueName: 'test-queue',
      flashSaleId: mockFlashSales[0]._id,
      head: mockQueueMembers,
      holds: [{ key: 'hold-1', email: 'test@example.com', ttlSec: 100, inQueue: true }],
      otherQueues: [{ saleId: 'other-sale', size: 5 }],
      strays: [],
    };

    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 })
      .mockResolvedValueOnce(mockAudit);

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Audit Snapshot')).toBeInTheDocument();
    });

    const refreshAuditButton = screen.getByRole('button', { name: /refresh audit/i });
    fireEvent.click(refreshAuditButton);

    await waitFor(() => {
      expect(screen.getByText('Head Preview (with Hold TTL)')).toBeInTheDocument();
      expect(screen.getByText('Active Holds')).toBeInTheDocument();
      expect(screen.getByText('Other Queues')).toBeInTheDocument();
      expect(screen.getByText('Strays (In Queue while Holding)')).toBeInTheDocument();
    });
  });

  it('should handle error when loading flash sales fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch.mockRejectedValue(new Error('Failed to load'));

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load flash sales');
    });
  });

  it('should handle error when loading overview fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockRejectedValueOnce(new Error('Failed to load overview'));

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load queue overview');
    });
  });

  it('should handle error when loading members fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockRejectedValueOnce(new Error('Failed to load members'));

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load queue members');
    });
  });

  it('should handle error when loading audit fails', async () => {
    const { toast } = require('react-toastify');
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 })
      .mockRejectedValueOnce(new Error('Failed to load audit'));

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Audit Snapshot')).toBeInTheDocument();
    });

    const refreshAuditButton = screen.getByRole('button', { name: /refresh audit/i });
    fireEvent.click(refreshAuditButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load audit');
    });
  });

  it('should show loading state for members table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ items: [], total: 0, page: 1, limit: 50 }), 100))
      );

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Queue Members')).toBeInTheDocument();
    });
  });

  it('should display position tags for queue members', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: mockFlashSales })
      .mockResolvedValueOnce(mockQueueOverview)
      .mockResolvedValueOnce({ items: mockQueueMembers, total: 2, page: 1, limit: 50 });

    render(<QueueMonitor />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
    });
  });
});
