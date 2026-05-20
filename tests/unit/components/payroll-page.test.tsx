import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: { id: 'user-1', employeeId: 'emp-1', companyId: 'co-1', role: 'ADMIN', email: 'a@b.com', name: 'Alice' },
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/payroll',
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    payroll: {
      getSummary: { useQuery: vi.fn() },
      listPayRuns: { useQuery: vi.fn() },
      createPayRun: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    useContext: vi.fn(() => ({
      payroll: {
        listPayRuns: { invalidate: vi.fn() },
        getSummary: { invalidate: vi.fn() },
      },
    })),
  },
}));

import { trpc } from '@/lib/trpc';
import PayrollPage from '@/app/(dashboard)/payroll/page';

const mockSummary = {
  totalPayrollYTD: 908_600,
  employeeCount: 28,
  nextRunDate: new Date('2026-04-01'),
  pendingCount: 1,
};

const mockPayRuns = [
  {
    id: 'run-1',
    companyId: 'co-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    totalAmount: 184_230,
    currency: 'USD',
    employeeCount: 28,
    status: 'COMPLETED',
    processedAt: new Date('2026-03-15'),
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-15'),
  },
  {
    id: 'run-2',
    companyId: 'co-1',
    periodStart: new Date('2026-02-16'),
    periodEnd: new Date('2026-02-28'),
    totalAmount: 178_990,
    currency: 'USD',
    employeeCount: 28,
    status: 'COMPLETED',
    processedAt: new Date('2026-02-28'),
    createdAt: new Date('2026-02-16'),
    updatedAt: new Date('2026-02-28'),
  },
];

function setupDefaultMocks() {
  vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
    data: mockSummary, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.payroll.listPayRuns.useQuery).mockReturnValue({
    data: { payRuns: mockPayRuns, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.payroll.createPayRun.useMutation).mockReturnValue({
    mutate: vi.fn(), isPending: false,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('PayrollPage', () => {
  // PC-1: Total Payroll stat card shows data-driven value, not hardcoded "$1.2M"
  it('PC-1: Total Payroll shows formatted totalPayrollYTD from getSummary', () => {
    vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
      data: { ...mockSummary, totalPayrollYTD: 750_000 }, isLoading: false, error: null,
    } as any);
    render(<PayrollPage />);
    expect(screen.getByText(/750/)).toBeDefined();
    expect(screen.queryByText('$1.2M')).toBeNull();
  });

  // PC-2: Employees stat shows employeeCount, not hardcoded 247
  it('PC-2: Employees stat shows employeeCount from getSummary', () => {
    vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
      data: { ...mockSummary, employeeCount: 31 }, isLoading: false, error: null,
    } as any);
    render(<PayrollPage />);
    expect(screen.getByText('31')).toBeDefined();
    expect(screen.queryByText('247')).toBeNull();
  });

  // PC-3: Next Run shows formatted nextRunDate, not hardcoded "Apr 1"
  it('PC-3: Next Run stat shows formatted nextRunDate from getSummary', () => {
    vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
      data: { ...mockSummary, nextRunDate: new Date('2026-05-16') }, isLoading: false, error: null,
    } as any);
    render(<PayrollPage />);
    expect(screen.getByText(/May 16/)).toBeDefined();
    expect(screen.queryByText('Apr 1')).toBeNull();
  });

  // PC-4: Pending Reviews shows pendingCount, not hardcoded 3
  it('PC-4: Pending Reviews shows pendingCount from getSummary', () => {
    vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
      data: { ...mockSummary, pendingCount: 7 }, isLoading: false, error: null,
    } as any);
    render(<PayrollPage />);
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.queryByText(/^3$/)).toBeNull();
  });

  // PC-5: Pay run table renders rows from listPayRuns data
  it('PC-5: Pay run table renders rows from listPayRuns data', () => {
    render(<PayrollPage />);
    // Both pay run period ranges should appear (use – separator to distinguish from processed date)
    expect(screen.getByText(/Mar 1 –/)).toBeDefined();
    expect(screen.getByText(/Feb 16 –/)).toBeDefined();
  });

  // PC-6: Pay run row shows formatted period range
  it('PC-6: Pay run row shows formatted period range from periodStart/periodEnd', () => {
    render(<PayrollPage />);
    expect(screen.getByText(/Mar 1 –/)).toBeDefined();
  });

  // PC-7: Loading skeletons render when getSummary is loading
  it('PC-7: Loading skeletons render when getSummary is loading', () => {
    vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any);
    const { container } = render(<PayrollPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('$1.2M')).toBeNull();
  });

  // PC-8: Loading skeletons render when listPayRuns is loading
  it('PC-8: Loading skeletons render when listPayRuns is loading', () => {
    vi.mocked(trpc.payroll.listPayRuns.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any);
    const { container } = render(<PayrollPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  // PC-9: Empty state shown when listPayRuns returns empty array
  it('PC-9: Empty state shown when listPayRuns returns empty array', () => {
    vi.mocked(trpc.payroll.listPayRuns.useQuery).mockReturnValue({
      data: { payRuns: [], nextCursor: undefined }, isLoading: false, error: null,
    } as any);
    render(<PayrollPage />);
    expect(screen.getByText(/no pay runs/i)).toBeDefined();
  });
});
