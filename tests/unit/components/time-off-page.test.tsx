import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const mockBalance = {
  employeeId: 'emp-1',
  year: 2024,
  vacation: { allocated: 20, used: 5, remaining: 15 },
  sick: { allocated: 10, used: 2, remaining: 8 },
  personal: { allocated: 3, used: 0, remaining: 3 },
};

const mockRequests = [
  {
    id: 'req-1', status: 'APPROVED', employeeId: 'emp-1',
    startDate: new Date('2024-06-10'), endDate: new Date('2024-06-14'), days: 5,
    reason: 'Summer vacation',
    employee: { id: 'emp-1', firstName: 'Alice', lastName: 'T', department: { name: 'Eng' } },
    policy: { id: 'pol-1', name: 'Vacation', type: 'VACATION' },
  },
  {
    id: 'req-2', status: 'PENDING', employeeId: 'emp-1',
    startDate: new Date('2024-09-01'), endDate: new Date('2024-09-05'), days: 5,
    reason: 'Trip',
    employee: { id: 'emp-1', firstName: 'Alice', lastName: 'T', department: { name: 'Eng' } },
    policy: { id: 'pol-1', name: 'Vacation', type: 'VACATION' },
  },
];

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: { id: 'user-1', employeeId: 'emp-1', companyId: 'co-1', role: 'ADMIN', email: 'a@b.com', name: 'Alice' },
    },
  }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    timeoff: {
      getPolicyBalances: { useQuery: () => ({ data: [
        { policyId: 'pol-1', policyName: 'Vacation', accrualRate: 2.083, allocated: 20, used: 5, available: 15, accrued: 10, projectedYearEnd: 18 },
        { policyId: 'pol-2', policyName: 'Sick Leave', accrualRate: 0.833, allocated: 10, used: 2, available: 8, accrued: 5, projectedYearEnd: 10 },
      ], isLoading: false, refetch: vi.fn() }) },
      listRequests: { useQuery: () => ({ data: { requests: mockRequests, nextCursor: undefined }, isLoading: false, refetch: vi.fn() }) },
      listPolicies: { useQuery: () => ({ data: [], isLoading: false }) },
      submitRequest: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      approve: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reject: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      cancelRequest: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isLoading: false }) },
      editRequest: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isLoading: false, error: null }) },
      createPolicy: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isLoading: false }) },
      updatePolicy: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isLoading: false }) },
      deletePolicy: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isLoading: false }) },
      teamCalendar: { useQuery: () => ({ data: [] }) },
    },
    employee: {
      list: { useQuery: () => ({ data: { employees: [] }, isLoading: false }) },
      getById: { useQuery: () => ({ data: { id: 'emp-1', directReports: [] }, isLoading: false }) },
    },
    useContext: () => ({
      timeoff: { listRequests: { invalidate: vi.fn() }, getPolicyBalances: { invalidate: vi.fn() }, teamCalendar: { invalidate: vi.fn() } },
      employee: { list: { invalidate: vi.fn() } },
    }),
    useUtils: () => ({
      timeoff: { listRequests: { invalidate: vi.fn() }, getPolicyBalances: { invalidate: vi.fn() }, teamCalendar: { invalidate: vi.fn() } },
      employee: { list: { invalidate: vi.fn() } },
    }),
  },
}));

import TimeOffPage from '@/app/(dashboard)/time-off/page';

describe('TimeOffPage', () => {
  it('shows balance cards with real data', () => {
    render(<TimeOffPage />);
    expect(screen.getByText('15.0')).toBeDefined(); // vacation remaining
  });

  it('shows request list with status badges', async () => {
    render(<TimeOffPage />);
    // Navigate to My Requests tab to see the status badges
    await userEvent.click(screen.getByRole('tab', { name: /my requests/i }));
    expect(await screen.findByText('APPROVED')).toBeDefined();
    expect(screen.getByText('PENDING')).toBeDefined();
  });

  it('shows Team Approvals tab for ADMIN role', () => {
    render(<TimeOffPage />);
    expect(screen.getByRole('tab', { name: /approvals/i })).toBeDefined();
  });

  it('opens request form modal when Request Time Off is clicked', () => {
    render(<TimeOffPage />);
    fireEvent.click(screen.getByRole('button', { name: /request time off/i }));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('shows Calendar tab', () => {
    render(<TimeOffPage />);
    expect(screen.getByRole('tab', { name: /calendar/i })).toBeDefined();
  });
});
