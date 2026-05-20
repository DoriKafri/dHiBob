import { render, screen } from '@testing-library/react';
import { trpc } from '@/lib/trpc';
import OnboardingPage from '@/app/(dashboard)/onboarding/page';
import OffboardingPage from '@/app/(dashboard)/offboarding/page';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      listNewHires: { useQuery: vi.fn() },
      listOffboarding: { useQuery: vi.fn() },
      addNewHire: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
    },
    workforce: {
      departments: { useQuery: vi.fn(() => ({ data: [] })) },
    },
    useUtils: vi.fn(() => ({
      onboarding: {
        listNewHires: { invalidate: vi.fn() },
        listOffboarding: { invalidate: vi.fn() },
      },
    })),
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    createClient: vi.fn(() => ({})),
  },
}));

vi.mock('@/components/onboarding/employee-checklist-row', () => ({
  EmployeeChecklistRow: ({ employee, mode }: { employee: any; mode: string }) => (
    <div data-testid={`employee-row-${mode}-${employee.id}`}>{employee.firstName} {employee.lastName}</div>
  ),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const mockTrpcClient = trpc.createClient({} as any);

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <trpc.Provider client={mockTrpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  </trpc.Provider>
);

const mockNewHires = [
  {
    id: 'emp-1', firstName: 'Alice', lastName: 'Smith',
    startDate: new Date('2026-03-01'), status: 'ACTIVE',
    department: { id: 'd1', name: 'Engineering' },
    avatar: null,
    onboardingTasks: [{ id: 't1', status: 'DONE' }, { id: 't2', status: 'NOT_STARTED' }],
  },
];
const mockOffboarding = [
  {
    id: 'emp-term', firstName: 'Bob', lastName: 'Jones',
    startDate: new Date('2024-01-01'), endDate: new Date('2026-03-15'), status: 'TERMINATED',
    department: { id: 'd2', name: 'Sales' },
    avatar: null,
    offboardingTasks: [{ id: 'ot1', status: 'NOT_STARTED' }],
  },
];

beforeEach(() => { vi.clearAllMocks(); });

describe('OnboardingPage', () => {
  it('renders loading skeletons', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = render(<OnboardingPage />, { wrapper: Wrapper });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state when no employees', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText(/no employees currently being onboarded/i)).toBeInTheDocument();
  });

  it('shows employee rows for onboarding', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: mockNewHires, isLoading: false } as any);
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByTestId('employee-row-onboarding-emp-1')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('has Onboarding title', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });
});

describe('OffboardingPage', () => {
  it('renders loading skeletons', () => {
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = render(<OffboardingPage />, { wrapper: Wrapper });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state when no terminated employees', () => {
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    render(<OffboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText(/no employees being offboarded/i)).toBeInTheDocument();
  });

  it('shows employee rows for offboarding', () => {
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: mockOffboarding, isLoading: false } as any);
    render(<OffboardingPage />, { wrapper: Wrapper });
    expect(screen.getByTestId('employee-row-offboarding-emp-term')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('has Offboarding title', () => {
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    render(<OffboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText('Offboarding')).toBeInTheDocument();
  });
});
