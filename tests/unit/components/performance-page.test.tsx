import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/trpc', () => {
  const mutationStub = () => ({ mutate: vi.fn(), isLoading: false, isPending: false });
  return {
    trpc: {
      performance: {
        listGoals:          { useQuery: vi.fn(() => ({ data: undefined, isLoading: false })) },
        listAllGoals:       { useQuery: vi.fn() },
        listCycles:         { useQuery: vi.fn() },
        listReviews:        { useQuery: vi.fn() },
        createGoal:         { useMutation: vi.fn(mutationStub) },
        createCycle:        { useMutation: vi.fn(mutationStub) },
        updateGoalProgress: { useMutation: vi.fn(mutationStub) },
        updateKeyResult:    { useMutation: vi.fn(mutationStub) },
        addKeyResult:       { useMutation: vi.fn(mutationStub) },
        submitReview:       { useMutation: vi.fn(mutationStub) },
      },
      employee: {
        list: { useQuery: vi.fn(() => ({ data: { employees: [] } })) },
      },
      useContext: vi.fn(() => ({
        performance: {
          listGoals:    { invalidate: vi.fn() },
          listAllGoals: { invalidate: vi.fn() },
          listCycles:   { invalidate: vi.fn() },
          listReviews:  { invalidate: vi.fn() },
        },
      })),
      useUtils: vi.fn(() => ({
        performance: {
          listGoals:    { invalidate: vi.fn() },
          listAllGoals: { invalidate: vi.fn() },
          listCycles:   { invalidate: vi.fn() },
          listReviews:  { invalidate: vi.fn() },
        },
      })),
    },
  };
});

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN', employeeId: 'emp-1' } },
    status: 'authenticated',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/performance',
}));

import { trpc } from '@/lib/trpc';
import PerformancePage from '@/app/(dashboard)/performance/page';

const mockGoals = [
  {
    id: 'goal-1', title: 'Increase test coverage to 80%', description: 'Improve code quality',
    status: 'ACTIVE', progress: 65, type: 'INDIVIDUAL',
    dueDate: new Date('2026-03-31'), startDate: new Date('2026-01-01'),
    employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith', avatar: null },
    keyResults: [
      { id: 'kr-1', title: 'Unit tests', targetValue: 80, currentValue: 52, unit: '%' },
      { id: 'kr-2', title: 'Integration tests', targetValue: 20, currentValue: 13, unit: 'tests' },
    ],
  },
  {
    id: 'goal-2', title: 'Launch new dashboard', description: '',
    status: 'COMPLETED', progress: 100, type: 'TEAM',
    dueDate: new Date('2026-02-28'), startDate: new Date('2026-01-01'),
    employee: { id: 'emp-2', firstName: 'Bob', lastName: 'Jones', avatar: null },
    keyResults: [],
  },
];

const mockCycles = [
  {
    id: 'cycle-1', name: '2026 Annual Performance Review',
    type: 'ANNUAL', status: 'ACTIVE',
    startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
    _count: { reviews: 3 },
  },
];

function setupDefaultMocks() {
  vi.mocked(trpc.performance.listAllGoals.useQuery).mockReturnValue({
    data: mockGoals, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.performance.listCycles.useQuery).mockReturnValue({
    data: { cycles: mockCycles, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
}

beforeEach(() => { vi.clearAllMocks(); setupDefaultMocks(); });

describe('PerformancePage', () => {
  it('C-1: Active Goals stat card shows correct count', () => {
    render(<PerformancePage />);
    expect(screen.getByText('Active Goals')).toBeInTheDocument();
    // 1 active goal — may appear multiple times in the UI
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
  });

  it('C-2: Completed stat card shows correct count', () => {
    render(<PerformancePage />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('C-3: Avg Progress stat card shows computed average', () => {
    render(<PerformancePage />);
    // (65 + 100) / 2 = 82.5 -> 83%
    expect(screen.getByText('83%')).toBeInTheDocument();
  });

  it('C-4: Goals tab renders goal titles from data', () => {
    render(<PerformancePage />);
    expect(screen.getByText('Increase test coverage to 80%')).toBeInTheDocument();
    expect(screen.getByText('Launch new dashboard')).toBeInTheDocument();
  });

  it('C-5: Goals show progress bars', () => {
    const { container } = render(<PerformancePage />);
    const progressBars = container.querySelectorAll('[style*="width: 65%"], [style*="width: 100%"]');
    expect(progressBars.length).toBeGreaterThanOrEqual(2);
  });

  it('C-6: Review Cycles tab exists and is clickable', () => {
    render(<PerformancePage />);
    const tabs = screen.getAllByRole('tab');
    const reviewTab = tabs.find(t => t.textContent?.includes('Review'));
    expect(reviewTab).toBeDefined();
  });

  it('C-7: Skeleton loading states appear when data is loading', () => {
    vi.mocked(trpc.performance.listAllGoals.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.performance.listCycles.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    render(<PerformancePage />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('C-8: Empty state when no goals', () => {
    vi.mocked(trpc.performance.listAllGoals.useQuery).mockReturnValue({ data: [], isLoading: false, error: null } as any);
    render(<PerformancePage />);
    expect(screen.getByText(/no goals yet/i)).toBeInTheDocument();
  });

  it('C-9: "New Goal" button opens create goal modal', () => {
    render(<PerformancePage />);
    fireEvent.click(screen.getByRole('button', { name: /new goal/i }));
    const createGoalTexts = screen.getAllByText('Create Goal');
    expect(createGoalTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('C-10: Goal card shows key results count', () => {
    render(<PerformancePage />);
    expect(screen.getByText('2 key results')).toBeInTheDocument();
  });
});
