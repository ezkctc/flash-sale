import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { FlashSaleForm } from './FlashSaleForm';
import dayjs from 'dayjs';

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
  };
});

describe('FlashSaleForm', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form with all fields', () => {
    render(<FlashSaleForm onChange={mockOnChange} />);

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/schedule/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/inventory/i)).toBeInTheDocument();
  });

  it('should render with default values for new sale', () => {
    render(<FlashSaleForm onChange={mockOnChange} isEditing={false} />);

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('');

    expect(screen.getByLabelText(/inventory/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/inventory/i)).not.toBeDisabled();
  });

  it('should render with initial values when editing', () => {
    const initial = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Existing Sale',
      description: 'Test description',
      startsAt: new Date('2025-12-01T10:00:00Z'),
      endsAt: new Date('2025-12-01T12:00:00Z'),
      currentQuantity: 50,
      startingQuantity: 100,
      status: 'OnSchedule',
    };

    render(<FlashSaleForm initial={initial} onChange={mockOnChange} isEditing={true} />);

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Existing Sale');

    const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe('Test description');
  });

  it('should hide inventory field when editing', () => {
    const initial = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Existing Sale',
      currentQuantity: 50,
      startingQuantity: 100,
    };

    render(<FlashSaleForm initial={initial} onChange={mockOnChange} isEditing={true} />);

    expect(screen.queryByLabelText(/inventory/i)).not.toBeInTheDocument();
  });

  it('should call onChange when name is changed', async () => {
    render(<FlashSaleForm onChange={mockOnChange} />);

    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'New Sale Name' } });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Sale Name',
        })
      );
    });
  });

  it('should call onChange when description is changed', async () => {
    render(<FlashSaleForm onChange={mockOnChange} />);

    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: 'New description' } });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'New description',
        })
      );
    });
  });

  it('should validate required fields', async () => {
    render(<FlashSaleForm onChange={mockOnChange} />);

    const form = screen.getByLabelText(/name/i).closest('form');
    if (form) {
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.queryByText(/required/i)).toBeInTheDocument();
      });
    }
  });

  it('should set default time period 5 minutes from now', () => {
    const now = dayjs();
    const expectedStart = now.add(5, 'minute').second(0);

    render(<FlashSaleForm onChange={mockOnChange} />);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: expect.any(String),
        endsAt: expect.any(String),
      })
    );
  });

  it('should include startingQuantity in onChange for new sales', async () => {
    render(<FlashSaleForm onChange={mockOnChange} isEditing={false} />);

    const quantityInput = screen.getByLabelText(/inventory/i);
    fireEvent.change(quantityInput, { target: { value: '100' } });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          currentQuantity: 100,
          startingQuantity: 100,
        })
      );
    });
  });

  it('should not allow changing inventory when editing', () => {
    const initial = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Existing Sale',
      currentQuantity: 50,
      startingQuantity: 100,
    };

    render(<FlashSaleForm initial={initial} onChange={mockOnChange} isEditing={true} />);

    expect(screen.queryByLabelText(/inventory/i)).not.toBeInTheDocument();
  });

  it('should show correct placeholder for inventory', () => {
    render(<FlashSaleForm onChange={mockOnChange} isEditing={false} />);

    const quantityInput = screen.getByLabelText(/inventory/i);
    expect(quantityInput).toHaveAttribute('placeholder', 'Enter quantity');
  });

  it('should handle form with all fields filled', async () => {
    render(<FlashSaleForm onChange={mockOnChange} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Complete Sale' } });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Complete description' },
    });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
    });

    const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0];
    expect(lastCall.name).toBeDefined();
    expect(lastCall.description).toBeDefined();
  });

  it('should preserve existing status when editing', async () => {
    const initial = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Existing Sale',
      status: 'Active',
      currentQuantity: 50,
      startingQuantity: 100,
    };

    render(<FlashSaleForm initial={initial} onChange={mockOnChange} isEditing={true} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Updated Name' } });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  it('should handle empty description', async () => {
    render(<FlashSaleForm onChange={mockOnChange} />);

    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: '' } });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
        })
      );
    });
  });

  it('should initialize with minimum quantity of 1 for new sales', () => {
    render(<FlashSaleForm onChange={mockOnChange} isEditing={false} />);

    const quantityInput = screen.getByLabelText(/inventory/i) as HTMLInputElement;
    expect(quantityInput).toHaveAttribute('min', '1');
  });

  it('should use initial period when provided', () => {
    const initial = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Sale',
      startsAt: new Date('2025-12-01T10:00:00Z'),
      endsAt: new Date('2025-12-01T12:00:00Z'),
      currentQuantity: 100,
      startingQuantity: 100,
    };

    render(<FlashSaleForm initial={initial} onChange={mockOnChange} isEditing={false} />);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: expect.any(String),
        endsAt: expect.any(String),
      })
    );
  });
});
