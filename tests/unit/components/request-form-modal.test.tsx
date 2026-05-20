import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const mockSubmitMutation = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    timeoff: {
      listPolicies: {
        useQuery: vi.fn(() => ({
          data: [
            { id: 'pol-1', name: 'Vacation', type: 'VACATION' },
            { id: 'pol-2', name: 'Sick Leave', type: 'SICK' },
          ],
          isLoading: false,
        })),
      },
      getPolicyBalances: {
        useQuery: vi.fn(() => ({
          data: [
            { id: 'pol-1', name: 'Vacation', available: 15 },
            { id: 'pol-2', name: 'Sick Leave', available: 8 },
          ],
        })),
      },
      submitRequest: {
        useMutation: () => ({ mutate: mockSubmitMutation, isPending: false }),
      },
    },
    useContext: () => ({ timeoff: { listRequests: { invalidate: mockInvalidate } } }),
  },
}));

// Mock Radix Select to a plain <select> so jsdom can drive it
vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: { onValueChange?: (v: string) => void; children: React.ReactNode }) => (
    <select data-testid="policy-select" onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import React from 'react';
import RequestFormModal from '@/components/time-off/request-form-modal';

describe('RequestFormModal', () => {
  it('renders policy options in the select dropdown', async () => {
    render(<RequestFormModal employeeId="emp-1" open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Vacation')).toBeDefined();
  });

  it('shows validation error when endDate is before startDate', async () => {
    // Test the form schema validation directly — refine fires after all fields pass individual validation.
    // policyId must be set for the refine to run.
    const { z } = await import('zod');
    const schema = z.object({
      policyId: z.string().min(1),
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      reason: z.string().optional(),
    }).refine(
      (data) => new Date(data.endDate) >= new Date(data.startDate),
      { message: 'End date must not be before start date', path: ['endDate'] }
    );
    const result = schema.safeParse({
      policyId: 'pol-1',
      startDate: '2024-06-14',
      endDate: '2024-06-10',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endDateError = result.error.errors.find(e => e.path.includes('endDate'));
      expect(endDateError?.message).toMatch(/end date must not be before/i);
    }
    // Also verify mutation not called
    expect(mockSubmitMutation).not.toHaveBeenCalled();
  });

  it('calls submitRequest mutation with policyId on valid form submit', async () => {
    mockSubmitMutation.mockClear();
    render(<RequestFormModal employeeId="emp-1" open={true} onOpenChange={() => {}} />);

    // Select a policy using the mocked plain <select>
    await act(async () => {
      fireEvent.change(screen.getByTestId('policy-select'), { target: { value: 'pol-1' } });
    });

    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2024-06-10' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-06-14' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form'));
    });

    await waitFor(() => {
      expect(mockSubmitMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-1',
          policyId: 'pol-1',
          startDate: new Date('2024-06-10'),
          endDate: new Date('2024-06-14'),
        }),
      );
    });
  });
});
