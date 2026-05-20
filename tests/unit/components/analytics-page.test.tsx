import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock tRPC entirely — we test the component behavior, not the network
vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      headcount: { useQuery: vi.fn() },
      turnoverByDepartment: { useQuery: vi.fn() },
      headcountTimeline: { useQuery: vi.fn() },
      salaryByDepartment: { useQuery: vi.fn() },
      futureCostForecast: { useQuery: vi.fn() },
      genderDistribution: { useQuery: vi.fn() },
      ageDistribution: { useQuery: vi.fn() },
    },
  },
}));

// Mock recharts to avoid canvas/ResizeObserver issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Bar: () => null,
  Line: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/analytics',
}));

import { trpc } from '@/lib/trpc';
import AnalyticsPage from '@/app/(dashboard)/analytics/page';

// Standard mock data used across B tests
const mockHeadcountData = {
  total: 52,
  groupBy: 'department',
  grouped: [{ key: 'Engineering', count: 30 }, { key: 'Sales', count: 22 }],
  avgTenureMonths: 18.5,
};
const mockAttritionData = {
  period: { startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31') },
  overall: { terminations: 4, headcount: 52, attritionRate: 7.69 },
  byGroup: [{ key: 'Engineering', terminations: 2, headcount: 30, attritionRate: 6.67 }],
  groupBy: 'department',
};
const mockHeadcountOverTimeData = [
  { month: '2025-04', count: 48 },
  { month: '2025-05', count: 50 },
  { month: '2026-03', count: 52 },
];
const mockTimeToHireData = [
  { month: '2025-04', avgDays: 21, hires: 3 },
  { month: '2025-05', avgDays: 18, hires: 5 },
];

function setupDefaultMocks() {
  vi.mocked(trpc.analytics.headcount.useQuery).mockReturnValue({
    data: mockHeadcountData, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.analytics.turnoverByDepartment.useQuery).mockReturnValue({
    data: { data: [{ department: 'Engineering', terminations: 2, headcount: 30, turnoverRate: 6.7 }], totalTerminated: 2, period: '12 months' },
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.analytics.headcountTimeline.useQuery).mockReturnValue({
    data: [{ month: '2025-04', count: 48 }, { month: '2025-05', count: 50 }, { month: '2026-03', count: 52 }],
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.analytics.salaryByDepartment.useQuery).mockReturnValue({
    data: { byDepartment: [{ key: 'Engineering', avgSalary: 120000, count: 10 }], byPosition: [{ key: 'Engineer', avgSalary: 115000, count: 8 }] },
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.analytics.futureCostForecast.useQuery).mockReturnValue({
    data: [{ month: '2026-05', currentCost: 500000, futureCost: 520000 }],
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.analytics.genderDistribution.useQuery).mockReturnValue({
    data: { overall: [{ gender: 'Male', count: 30 }, { gender: 'Female', count: 22 }], byDepartment: [], total: 52 },
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.analytics.ageDistribution.useQuery).mockReturnValue({
    data: { buckets: [{ range: '25-34', count: 20 }, { range: '35-44', count: 15 }], averageAge: 32.5, totalWithDob: 35 },
    isLoading: false, error: null,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('AnalyticsPage', () => {
  // B-1: Headcount stat card shows live total, not hardcoded 247
  it('B-1: Headcount stat card displays value from tRPC data, not hardcoded 247', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.queryByText('247')).not.toBeInTheDocument();
  });

  // B-2: Turnover stat card shows total terminated count
  it('B-2: Turnover stat card shows terminated count from tRPC data', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Turnover (12mo)')).toBeInTheDocument();
  });

  // B-3: Avg Salary stat card shows computed value
  it('B-3: Avg Salary stat card shows computed value', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('Avg Salary')).toBeInTheDocument();
    expect(screen.getByText('$120,000')).toBeInTheDocument();
  });

  // B-4: Avg Tenure card shows derived value from avgTenureMonths, not hardcoded 2.4y
  it('B-4: Avg Tenure shows derived value from avgTenureMonths, not hardcoded 2.4y', () => {
    render(<AnalyticsPage />);
    // 18.5 months = ~1.5y
    expect(screen.getByText('1.5y')).toBeInTheDocument();
    expect(screen.queryByText('2.4y')).not.toBeInTheDocument();
  });

  // B-5: Headcount by Department chart renders a BarChart, not placeholder text
  it('B-5: Headcount by Department renders a BarChart, not placeholder text', () => {
    render(<AnalyticsPage />);
    const barCharts = screen.getAllByTestId('bar-chart');
    expect(barCharts.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Recharts bar chart placeholder')).not.toBeInTheDocument();
  });

  // B-6: Headcount Over Time chart renders a LineChart, not placeholder text
  it('B-6: Headcount Over Time renders a LineChart, not placeholder text', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByText('Gender Distribution')).toBeInTheDocument();
  });

  // B-7: Turnover by Department chart renders a BarChart
  it('B-7: Turnover by Department renders a BarChart', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('Turnover by Department (12 months)')).toBeInTheDocument();
    const barCharts = screen.getAllByTestId('bar-chart');
    expect(barCharts.length).toBeGreaterThanOrEqual(1);
  });

  // B-8: Headcount Over Time chart renders a LineChart
  it('B-8: Headcount Over Time renders a LineChart', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('Headcount Over Time (12 months)')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  // B-9: Loading skeletons render when queries are in flight
  it('B-9: Loading skeletons render when queries are loading', () => {
    vi.mocked(trpc.analytics.headcount.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.analytics.turnoverByDepartment.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.analytics.headcountTimeline.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.analytics.salaryByDepartment.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.analytics.futureCostForecast.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.analytics.genderDistribution.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);
    vi.mocked(trpc.analytics.ageDistribution.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null } as any);

    render(<AnalyticsPage />);

    // Should have skeleton elements
    const skeletons = document.querySelectorAll('[data-testid="skeleton"], .animate-pulse, [role="status"]');
    expect(skeletons.length).toBeGreaterThan(0);
    // Stat card values should not be rendered
    expect(screen.queryByText('52')).not.toBeInTheDocument();
  });

  // B-10: Charts handle empty data gracefully
  it('B-10: Charts handle empty data gracefully with No data message', () => {
    vi.mocked(trpc.analytics.headcount.useQuery).mockReturnValue({
      data: { total: 0, grouped: [], groupBy: 'department', avgTenureMonths: 0 },
      isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.analytics.turnoverByDepartment.useQuery).mockReturnValue({
      data: { data: [], totalTerminated: 0, period: '12 months' },
      isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.analytics.headcountTimeline.useQuery).mockReturnValue({
      data: [], isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.analytics.salaryByDepartment.useQuery).mockReturnValue({
      data: { byDepartment: [], byPosition: [] }, isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.analytics.futureCostForecast.useQuery).mockReturnValue({
      data: [], isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.analytics.genderDistribution.useQuery).mockReturnValue({
      data: { overall: [], byDepartment: [], total: 0 }, isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.analytics.ageDistribution.useQuery).mockReturnValue({
      data: { buckets: [], averageAge: null, totalWithDob: 0 }, isLoading: false, error: null,
    } as any);

    render(<AnalyticsPage />);
    // Page renders without throwing
    // Some "No data" indicator should be visible
    const noDataElements = screen.queryAllByText(/no data/i);
    expect(noDataElements.length).toBeGreaterThan(0);
  });
});
