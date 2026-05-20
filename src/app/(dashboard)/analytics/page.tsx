"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Users, TrendingUp, Clock, Target, DollarSign, UserCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTheme } from "next-themes";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      data-testid="skeleton"
      className={`animate-pulse bg-gray-200 rounded ${className ?? ""}`}
    />
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-48 w-full" />;
}

function NoData() {
  return (
    <div className="h-48 flex items-center justify-center text-gray-400">
      No data
    </div>
  );
}

function formatTenure(months: number): string {
  const years = months / 12;
  return `${years.toFixed(1)}y`;
}

const PIE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

// These are overridden inside the component based on theme
let AXIS_TICK = { fontSize: 12, fill: '#374151', fontWeight: 600 };
let AXIS_TICK_SM = { fontSize: 11, fill: '#374151', fontWeight: 600 };
let GRID_STROKE = '#e5e7eb';
const GENDER_COLORS: Record<string, string> = {
  Male: "#6366f1",
  Female: "#ec4899",
  Other: "#10b981",
  "Not specified": "#9ca3af",
};

export default function AnalyticsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const textColor = isDark ? '#e5e7eb' : '#374151';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  AXIS_TICK = { fontSize: 12, fill: textColor, fontWeight: 600 };
  AXIS_TICK_SM = { fontSize: 11, fill: textColor, fontWeight: 600 };
  GRID_STROKE = gridColor;
  const tooltipStyle = { fontWeight: 500, backgroundColor: isDark ? '#1f2937' : '#fff', border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`, color: textColor };
  const legendStyle = { fontWeight: 600, fontSize: 13, color: textColor };

  const { data: headcountData, isLoading: headcountLoading } =
    trpc.analytics.headcount.useQuery({ groupBy: "department" });

  const { data: turnoverData, isLoading: turnoverLoading } =
    trpc.analytics.turnoverByDepartment.useQuery();

  const { data: headcountTimelineData, isLoading: headcountTimelineLoading } =
    trpc.analytics.headcountTimeline.useQuery();

  const { data: salaryData, isLoading: salaryLoading } =
    trpc.analytics.salaryByDepartment.useQuery();

  const { data: forecastData, isLoading: forecastLoading } =
    trpc.analytics.futureCostForecast.useQuery();

  const { data: genderData, isLoading: genderLoading } =
    trpc.analytics.genderDistribution.useQuery();

  const { data: ageData, isLoading: ageLoading } =
    trpc.analytics.ageDistribution.useQuery();

  // Derived stat card values
  const headcountValue = headcountLoading
    ? "—"
    : headcountData != null
    ? String(headcountData.total)
    : "—";

  const turnoverValue = turnoverLoading
    ? "—"
    : turnoverData != null
    ? `${turnoverData.totalTerminated}`
    : "0";

  const avgTenureValue =
    headcountLoading || headcountData == null
      ? "—"
      : formatTenure(headcountData.avgTenureMonths);

  const avgAgeValue = ageLoading ? "—" : ageData?.averageAge != null ? `${ageData.averageAge}y` : "—";

  const genderRatio = genderLoading || !genderData ? "—" : (() => {
    const m = genderData.overall.find((g: any) => g.gender === 'Male')?.count ?? 0;
    const f = genderData.overall.find((g: any) => g.gender === 'Female')?.count ?? 0;
    if (m + f === 0) return "—";
    return `${Math.round((f / (m + f)) * 100)}% W`;
  })();

  const avgSalaryValue = salaryLoading || !salaryData ? "—" : (() => {
    const all = salaryData.byDepartment;
    if (all.length === 0) return "—";
    const totalSal = all.reduce((s: number, d: any) => s + d.avgSalary * d.count, 0);
    const totalCount = all.reduce((s: number, d: any) => s + d.count, 0);
    return totalCount > 0 ? `$${Math.round(totalSal / totalCount).toLocaleString()}` : "—";
  })();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {headcountLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard
            title="Headcount"
            value={headcountValue}
            icon={<Users size={20} />}
          />
        )}
        {turnoverLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard
            title="Turnover (12mo)"
            value={turnoverValue}
            icon={<TrendingUp size={20} />}
          />
        )}
        {headcountLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard
            title="Avg Seniority"
            value={avgTenureValue}
            icon={<Clock size={20} />}
          />
        )}
        <StatCard
          title="Avg Salary"
          value={avgSalaryValue}
          icon={<DollarSign size={20} />}
        />
        <StatCard
          title="Avg Age"
          value={avgAgeValue}
          icon={<Target size={20} />}
        />
        <StatCard
          title="Gender Ratio"
          value={genderRatio}
          icon={<UserCheck size={20} />}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Salary by Department */}
        <Card>
          <CardHeader>
            <CardTitle>Average Salary by Department</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {salaryLoading ? (
              <ChartSkeleton />
            ) : !salaryData || salaryData.byDepartment.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData.byDepartment}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="key" tick={AXIS_TICK} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={AXIS_TICK} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Avg Salary']} contentStyle={tooltipStyle} />
                  <Bar dataKey="avgSalary" fill="#6366f1" name="Avg Salary" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Average Salary by Position */}
        <Card>
          <CardHeader>
            <CardTitle>Average Salary by Position</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {salaryLoading ? (
              <ChartSkeleton />
            ) : !salaryData || salaryData.byPosition.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData.byPosition.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={AXIS_TICK} />
                  <YAxis type="category" dataKey="key" width={150} tick={AXIS_TICK_SM} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Avg Salary']} contentStyle={tooltipStyle} />
                  <Bar dataKey="avgSalary" fill="#8b5cf6" name="Avg Salary" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Future Cost Forecast */}
        <Card>
          <CardHeader>
            <CardTitle>Future Cost Forecast (12 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {forecastLoading ? (
              <ChartSkeleton />
            ) : !forecastData || forecastData.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={AXIS_TICK} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Area type="monotone" dataKey="currentCost" stroke="#94a3b8" fill="#f1f5f9" name="Current Cost" strokeWidth={2} strokeDasharray="6 4" />
                  <Area type="monotone" dataKey="futureCost" stroke="#0ea5e9" fill="#bae6fd" fillOpacity={0.5} name="Projected Cost" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Gender Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {genderLoading ? (
              <ChartSkeleton />
            ) : !genderData || genderData.overall.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderData.overall}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="count"
                    nameKey="gender"
                    label={({ gender, count }: any) => `${gender}: ${count}`}
                  >
                    {genderData.overall.map((entry: any, i: number) => (
                      <Cell key={entry.gender} fill={GENDER_COLORS[entry.gender] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Age Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Age Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {ageLoading ? (
              <ChartSkeleton />
            ) : !ageData || ageData.buckets.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData.buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="range" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#10b981" name="Employees" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Headcount by Department */}
        <Card>
          <CardHeader>
            <CardTitle>Headcount by Department</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {headcountLoading ? (
              <ChartSkeleton />
            ) : !headcountData || headcountData.grouped.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={headcountData.grouped}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="key" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#6366f1" name="Headcount" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Headcount Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Headcount Over Time (12 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {headcountTimelineLoading ? (
              <ChartSkeleton />
            ) : !headcountTimelineData || headcountTimelineData.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={headcountTimelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="count" stroke="#6366f1" name="Headcount" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Turnover by Department */}
        <Card>
          <CardHeader>
            <CardTitle>Turnover by Department (12 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {turnoverLoading ? (
              <ChartSkeleton />
            ) : !turnoverData || turnoverData.data.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={turnoverData.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="department" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip formatter={(v: number, name: string) => [name === 'turnoverRate' ? `${v}%` : v, name === 'turnoverRate' ? 'Turnover Rate' : 'Terminations']} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar dataKey="terminations" fill="#ef4444" name="Terminations" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="turnoverRate" fill="#f59e0b" name="Turnover Rate (%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
