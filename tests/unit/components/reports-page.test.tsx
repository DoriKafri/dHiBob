import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock tRPC — we test component behavior, not network calls
vi.mock('@/lib/trpc', () => ({
  trpc: {
    reports: {
      getTerminationReport: { useQuery: vi.fn() },
      getActiveReport: { useQuery: vi.fn() },
      getSalaryReport: { useQuery: vi.fn() },
      getTotalCostReport: { useQuery: vi.fn() },
      getCustomReportData: { useQuery: vi.fn() },
      getExpenseReport: { useQuery: vi.fn() },
    },
  },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/reports',
}));

import { trpc } from '@/lib/trpc';
import ReportsPage from '@/app/(dashboard)/reports/page';

const MOCK_TERMINATION_ROWS = [
  { name: 'Bob Jones', seniorityYears: 4.8, terminationReason: 'Resignation', endDate: new Date('2025-03-15'), department: 'Sales' },
];
const MOCK_ACTIVE_ROWS = [
  { name: 'Alice Smith', startDate: new Date('2022-01-01'), seniorityYears: 3.2, salary: 95000, department: 'Engineering' },
];
const MOCK_SALARY_ROWS = [
  {
    name: 'Alice Smith', department: 'Engineering',
    currentSalary: 95000, currency: 'USD',
    futureIncreases: [{ effectiveDate: new Date('2026-07-01'), type: 'BASE_SALARY', salary: 105000, currency: 'USD' }],
  },
];
const MOCK_COST_MONTHS = [
  { month: '2026-05', total: 15000, byDepartment: { Engineering: 15000 } },
];
const MOCK_EXPENSE_ROWS = [
  { name: 'Alice Smith', department: 'Engineering', expenseType: 'Travel', supplierName: 'Acme Corp', amount: 350.00, currency: 'USD', expenseDate: '2026-04-10', payrollMonth: '2026-04', status: 'Approved' },
];

function setupDefaultMocks() {
  vi.mocked(trpc.reports.getTerminationReport.useQuery).mockReturnValue({
    data: { rows: MOCK_TERMINATION_ROWS }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.reports.getActiveReport.useQuery).mockReturnValue({
    data: { rows: MOCK_ACTIVE_ROWS }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.reports.getSalaryReport.useQuery).mockReturnValue({
    data: { rows: MOCK_SALARY_ROWS }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.reports.getTotalCostReport.useQuery).mockReturnValue({
    data: { months: MOCK_COST_MONTHS }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.reports.getCustomReportData.useQuery).mockReturnValue({
    data: undefined, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.reports.getExpenseReport.useQuery).mockReturnValue({
    data: { rows: MOCK_EXPENSE_ROWS }, isLoading: false, error: null,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('ReportsPage', () => {
  // C-1: Default tab shows Termination Report
  it('C-1: default tab shows Termination Report and its data', () => {
    render(<ReportsPage />);
    // Tab label exists
    expect(screen.getByRole('tab', { name: /termination/i })).toBeInTheDocument();
    // Employee name from mock data is visible
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    // Termination reason is visible
    expect(screen.getByText('Resignation')).toBeInTheDocument();
    // Hardcoded values are absent
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  // C-2: Active Employees tab shows its data
  it('C-2: clicking Active Employees tab shows active employee data', () => {
    render(<ReportsPage />);
    const activeTab = screen.getByRole('tab', { name: /active/i });
    fireEvent.click(activeTab);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('$95,000')).toBeInTheDocument();
  });

  // C-3: Compensation tab shows salary data
  it('C-3: clicking Compensation tab shows salary report', () => {
    render(<ReportsPage />);
    const compensationTab = screen.getByRole('tab', { name: /compensation/i });
    fireEvent.click(compensationTab);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('$95,000')).toBeInTheDocument();
  });

  // C-4: Expenses tab shows expense data
  it('C-4: clicking Expenses tab shows expense data', () => {
    render(<ReportsPage />);
    const expensesTab = screen.getByRole('tab', { name: /expenses/i });
    fireEvent.click(expensesTab);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
    expect(screen.getByText('350.00')).toBeInTheDocument();
  });

  // C-5: Loading state renders skeleton rows
  it('C-5: loading state shows skeleton rows, not real data', () => {
    vi.mocked(trpc.reports.getTerminationReport.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any);

    render(<ReportsPage />);

    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
    const skeletons = document.querySelectorAll('[data-testid="skeleton"], .animate-pulse, [role="status"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // C-6: Empty state renders without crash
  it('C-6: empty data renders "No results" message without crash', () => {
    vi.mocked(trpc.reports.getTerminationReport.useQuery).mockReturnValue({
      data: { rows: [] }, isLoading: false, error: null,
    } as any);

    render(<ReportsPage />);

    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
    expect(screen.getByText(/no results|no data|no records/i)).toBeInTheDocument();
  });

  // C-7: Clicking a sortable column header re-sorts the table
  it('C-7: clicking Name column header toggles sort direction', () => {
    render(<ReportsPage />);
    const nameHeader = screen.getByRole('columnheader', { name: /name/i });
    fireEvent.click(nameHeader);
    // After clicking, an arrow indicator should appear (↑ or ↓)
    expect(nameHeader.textContent).toMatch(/↑|↓|▲|▼/);
  });

  // C-8: Toggle a column off and it disappears from the table
  it('C-8: toggling off a column removes it from the table headers', () => {
    render(<ReportsPage />);
    // Find the column toggle button
    const toggleButton = screen.getByRole('button', { name: /columns|toggle|customize/i });
    fireEvent.click(toggleButton);
    // Find and uncheck "Reason" column (or similar)
    const reasonCheckbox = screen.getByRole('checkbox', { name: /reason|termination reason/i });
    fireEvent.click(reasonCheckbox);
    // The column header should be gone
    expect(screen.queryByRole('columnheader', { name: /reason/i })).not.toBeInTheDocument();
  });

  // C-9: Export Excel button triggers a file download
  it('C-9: Export Excel button is present and clickable', () => {
    render(<ReportsPage />);

    const downloadButton = screen.getByRole('button', { name: /export excel/i });
    expect(downloadButton).toBeInTheDocument();
    // Click should not throw — the xlsx library handles the actual download
    expect(() => fireEvent.click(downloadButton)).not.toThrow();
  });

  // C-10: Hardcoded placeholder values are not present
  it('C-10: no hardcoded employee names or placeholder values appear', () => {
    render(<ReportsPage />);
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('$1,200,000')).not.toBeInTheDocument();
  });
});
