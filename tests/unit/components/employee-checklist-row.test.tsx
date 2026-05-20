import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { EmployeeChecklistRow } from '@/components/onboarding/employee-checklist-row';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      getChecklist: {
        useQuery: vi.fn(),
      },
      getOffboardingChecklist: {
        useQuery: vi.fn(),
      },
      updateTaskStatus: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      updateOffboardingTaskStatus: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      createTask: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isLoading: false })),
      },
      createOffboardingTask: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isLoading: false })),
      },
      updateTaskAssignee: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      updateOffboardingTaskAssignee: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      updateTask: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      updateOffboardingTask: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      deleteTask: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      deleteOffboardingTask: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      listNewHires: {
        invalidate: vi.fn(),
      },
    },
    employee: {
      list: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
    },
    useUtils: vi.fn(() => ({
      onboarding: {
        listNewHires: { invalidate: vi.fn() },
        listOffboarding: { invalidate: vi.fn() },
        getChecklist: { invalidate: vi.fn() },
        getOffboardingChecklist: { invalidate: vi.fn() },
      },
    })),
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    createClient: vi.fn(() => ({})),
  },
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const mockTrpcClient = trpc.createClient({} as any);

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <trpc.Provider client={mockTrpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </trpc.Provider>
);

const mockEmployee = {
  id: 'emp-1',
  firstName: 'Alice',
  lastName: 'Smith',
  avatar: null,
  startDate: new Date('2026-03-01'),
  department: { name: 'Engineering' },
  onboardingTasks: [
    { id: 't1', status: 'DONE' },
    { id: 't2', status: 'NOT_STARTED' },
  ],
};

const mockSections = [
  {
    section: 'Pre-arrival',
    sectionType: 'GENERAL',
    tasks: [{ id: 't1', title: 'General task', status: 'DONE', dueDate: null, notes: null, assignee: null }],
  },
  {
    section: 'DevOps',
    sectionType: 'DEVOPS',
    tasks: [{ id: 't2', title: 'AWS setup', status: 'NOT_STARTED', dueDate: null, notes: null, assignee: null }],
  },
];

describe('EmployeeChecklistRow - DevOps section visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('C-4a: DevOps section is visible for Engineering employees (isDevOps=true)', async () => {
    vi.mocked(trpc.onboarding.getChecklist.useQuery).mockReturnValue({
      data: mockSections,
      isLoading: false,
    } as any);

    render(
      <EmployeeChecklistRow employee={mockEmployee as any} mode="onboarding" isDevOps={true} />,
      { wrapper: Wrapper }
    );

    // Expand the row
    fireEvent.click(screen.getByRole('button', { name: /alice smith/i }));

    expect(screen.getByTestId('section-DevOps')).toBeInTheDocument();
    expect(screen.getByText('AWS setup')).toBeInTheDocument();
  });

  it('C-4b: DevOps section is hidden for non-Engineering employees (isDevOps=false)', async () => {
    vi.mocked(trpc.onboarding.getChecklist.useQuery).mockReturnValue({
      data: mockSections,
      isLoading: false,
    } as any);

    render(
      <EmployeeChecklistRow employee={mockEmployee as any} mode="onboarding" isDevOps={false} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: /alice smith/i }));

    expect(screen.queryByTestId('section-DevOps')).not.toBeInTheDocument();
    expect(screen.queryByText('AWS setup')).not.toBeInTheDocument();
    // General section still visible
    expect(screen.getByTestId('section-Pre-arrival')).toBeInTheDocument();
  });
});

describe('EmployeeChecklistRow - Offboarding mode', () => {
  const terminatedEmployee = {
    id: 'emp-term',
    firstName: 'Bob',
    lastName: 'Jones',
    avatar: null,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2026-03-15'),
    department: { name: 'Sales' },
    offboardingTasks: [{ id: 'ot1', status: 'NOT_STARTED' }],
  };

  const offboardingSections = [
    {
      section: 'HR',
      tasks: [
        { id: 'ot1', title: 'Exit interview scheduled', status: 'NOT_STARTED', dueDate: null, notes: null, assignee: null },
        { id: 'ot2', title: 'Return company equipment', status: 'DONE', dueDate: null, notes: null, assignee: null },
      ],
    },
  ];

  it('C-5: offboarding mode fetches and shows the offboarding checklist', async () => {
    vi.mocked(trpc.onboarding.getOffboardingChecklist.useQuery).mockReturnValue({
      data: offboardingSections,
      isLoading: false,
    } as any);

    render(
      <EmployeeChecklistRow employee={terminatedEmployee as any} mode="offboarding" />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: /bob jones/i }));

    expect(screen.getByTestId('section-HR')).toBeInTheDocument();
    expect(screen.getByText('Exit interview scheduled')).toBeInTheDocument();
    expect(screen.getByText('Return company equipment')).toBeInTheDocument();
  });
});
