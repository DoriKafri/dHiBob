"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Users, Calendar, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_VARIANT: Record<string, string> = {
  COMPLETED: "success",
  PENDING: "warning",
  PROCESSING: "default",
  FAILED: "destructive",
};

function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPeriod(start: Date | string, end: Date | string): string {
  const s = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s} – ${e}`;
}

export default function PayrollPage() {
  const { data: summary, isLoading: summaryLoading } = trpc.payroll.getSummary.useQuery();
  const { data: runsData, isLoading: runsLoading } = trpc.payroll.listPayRuns.useQuery({ limit: 10 });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Payroll</h1>

      {summaryLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Payroll"
            value={formatCurrency(summary?.totalPayrollYTD ?? 0)}
            icon={<DollarSign size={20} />}
          />
          <StatCard
            title="Employees"
            value={summary?.employeeCount ?? 0}
            icon={<Users size={20} />}
          />
          <StatCard
            title="Next Run"
            value={formatDate(summary?.nextRunDate)}
            icon={<Calendar size={20} />}
          />
          <StatCard
            title="Pending Reviews"
            value={summary?.pendingCount ?? 0}
            icon={<FileText size={20} />}
          />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Recent Pay Runs</CardTitle></CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : runsData?.payRuns.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
              No pay runs yet.
            </p>
          ) : (
            <div className="space-y-3">
              {runsData?.payRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between p-3 border dark:border-charcoal-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      Pay Period: {formatPeriod(run.periodStart, run.periodEnd)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Processed {run.processedAt ? formatDate(run.processedAt) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(run.totalAmount, run.currency)}</p>
                    <Badge variant={STATUS_VARIANT[run.status] as any || "default"}>
                      {run.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
