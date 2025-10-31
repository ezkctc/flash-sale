import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { FlashSalesManager } from './FlashSalesManager';
import { mockFlashSales } from '@/test/fixtures';

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/services/flash-sales', () => ({
  listFlashSales: vi.fn(),
  createFlashSale: vi.fn(),
  updateFlashSale: vi.fn(),
  deleteFlashSale: vi.fn(),
}));

vi.mock('./FlashSaleForm', () => ({
  FlashSaleForm: ({ onChange, initial, isEditing }: any) => (
    <div data-testid="flash-sale-form">
      <input
        data-testid="form-name"
        onChange={(e) =>
          onChange({
            name: e.target.value,
            startsAt: new Date().toISOString(),
            endsAt: new Date().toISOString(),
            startingQuantity: 100,
          })
        }
        defaultValue={initial?.name || ''}
      />
      <span data-testid="is-editing">{isEditing ? 'editing' : 'creating'}</span>
    </div>
  ),
}));

describe('FlashSalesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render component with title', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: [] });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Flash Sales')).toBeInTheDocument();
    });
  });

  it('should load and display flash sales', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Flash Sale')).toBeInTheDocument();
      expect(screen.getByText('Second Flash Sale')).toBeInTheDocument();
    });

    expect(listFlashSales).toHaveBeenCalled();
  });

  it('should show error when loading fails', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    const { toast } = require('react-toastify');
    listFlashSales.mockRejectedValue(new Error('Failed to load'));

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load flash sales');
    });
  });

  it('should open create modal when New button is clicked', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: [] });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Flash Sales')).toBeInTheDocument();
    });

    const newButton = screen.getByRole('button', { name: /new/i });
    fireEvent.click(newButton);

    await waitFor(() => {
      expect(screen.getByText('New Flash Sale')).toBeInTheDocument();
    });
  });

  it('should open edit modal when Edit button is clicked', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Flash Sale')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Flash Sale')).toBeInTheDocument();
    });
  });

  it('should create new flash sale successfully', async () => {
    const { listFlashSales, createFlashSale } = require('@/lib/services/flash-sales');
    const { toast } = require('react-toastify');
    listFlashSales.mockResolvedValue({ items: [] });
    createFlashSale.mockResolvedValue({ id: 'new-id' });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new/i }));

    await waitFor(() => {
      expect(screen.getByTestId('flash-sale-form')).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId('form-name');
    fireEvent.change(nameInput, { target: { value: 'New Sale' } });

    const okButton = screen.getByRole('button', { name: /ok/i });
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(createFlashSale).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Created');
    });
  });

  it('should update existing flash sale successfully', async () => {
    const { listFlashSales, updateFlashSale } = require('@/lib/services/flash-sales');
    const { toast } = require('react-toastify');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });
    updateFlashSale.mockResolvedValue({ updated: 1 });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Flash Sale')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('flash-sale-form')).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId('form-name');
    fireEvent.change(nameInput, { target: { value: 'Updated Sale' } });

    const okButton = screen.getByRole('button', { name: /ok/i });
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(updateFlashSale).toHaveBeenCalledWith(
        mockFlashSales[0]._id,
        expect.objectContaining({
          name: 'Updated Sale',
        })
      );
      expect(toast.success).toHaveBeenCalledWith('Updated');
    });
  });

  it('should show error when create fails', async () => {
    const { listFlashSales, createFlashSale } = require('@/lib/services/flash-sales');
    const { toast } = require('react-toastify');
    listFlashSales.mockResolvedValue({ items: [] });
    createFlashSale.mockRejectedValue(new Error('Create failed'));

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new/i }));

    await waitFor(() => {
      expect(screen.getByTestId('flash-sale-form')).toBeInTheDocument();
    });

    const okButton = screen.getByRole('button', { name: /ok/i });
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to save');
    });
  });

  it('should display inventory correctly', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('75 / 100')).toBeInTheDocument();
      expect(screen.getByText('25 / 50')).toBeInTheDocument();
    });
  });

  it('should display status tags', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('OnSchedule')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('should show confirmation before deleting', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Flash Sale')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/delete flash sale/i)).toBeInTheDocument();
    });
  });

  it('should delete flash sale when confirmed', async () => {
    const { listFlashSales, deleteFlashSale } = require('@/lib/services/flash-sales');
    const { toast } = require('react-toastify');
    listFlashSales.mockResolvedValue({ items: mockFlashSales });
    deleteFlashSale.mockResolvedValue({ deleted: 1 });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Flash Sale')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/delete flash sale/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /ok/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteFlashSale).toHaveBeenCalledWith(mockFlashSales[0]._id);
      expect(toast.success).toHaveBeenCalledWith('Deleted');
    });
  });

  it('should reload list after successful operations', async () => {
    const { listFlashSales, createFlashSale } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: [] });
    createFlashSale.mockResolvedValue({ id: 'new-id' });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(listFlashSales).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /new/i }));

    await waitFor(() => {
      expect(screen.getByTestId('flash-sale-form')).toBeInTheDocument();
    });

    const okButton = screen.getByRole('button', { name: /ok/i });
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(listFlashSales).toHaveBeenCalledTimes(2);
    });
  });

  it('should close modal after successful create', async () => {
    const { listFlashSales, createFlashSale } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: [] });
    createFlashSale.mockResolvedValue({ id: 'new-id' });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new/i }));

    await waitFor(() => {
      expect(screen.getByText('New Flash Sale')).toBeInTheDocument();
    });

    const okButton = screen.getByRole('button', { name: /ok/i });
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(screen.queryByText('New Flash Sale')).not.toBeInTheDocument();
    });
  });

  it('should handle cancel on create modal', async () => {
    const { listFlashSales } = require('@/lib/services/flash-sales');
    listFlashSales.mockResolvedValue({ items: [] });

    render(<FlashSalesManager />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new/i }));

    await waitFor(() => {
      expect(screen.getByText('New Flash Sale')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('New Flash Sale')).not.toBeInTheDocument();
    });
  });
});
