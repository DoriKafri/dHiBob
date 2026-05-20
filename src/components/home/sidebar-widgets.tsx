"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Plane } from "lucide-react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

export function MeWidget() {
  const { data: session } = useSession();
  const employeeId = session?.user?.employeeId;

  const { data: balances, isLoading } = trpc.timeoff.getPolicyBalances.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId }
  );

  if (isLoading) return <div className="h-40 bg-gray-100 dark:bg-charcoal-800 animate-pulse rounded-xl" />;

  // Find vacation and sick balances
  const vacation = balances?.find((b: any) => b.policyName.toLowerCase().includes('vacation'));
  const sick = balances?.find((b: any) => b.policyName.toLowerCase().includes('sick'));

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 overflow-hidden">
      <CardHeader className="pb-2 border-b border-gray-50 dark:border-charcoal-800">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plane size={16} className="text-primary-500" />
          My Time Off
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {!balances || balances.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No time-off data available.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              {vacation && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Vacation</p>
                  <p className="text-xl font-bold">{vacation.available.toFixed(1)} <span className="text-xs font-normal text-gray-400">days</span></p>
                </div>
              )}
              {sick && (
                <div className="space-y-1 text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Sick Leave</p>
                  <p className="text-xl font-bold">{sick.available.toFixed(1)} <span className="text-xs font-normal text-gray-400">days</span></p>
                </div>
              )}
            </div>
            {/* Show other policies with accrual if any */}
            {balances.filter((b: any) => b !== vacation && b !== sick && (b.accrualRate ?? 0) > 0).map((b: any) => (
              <div key={b.policyId} className="flex items-center justify-between">
                <p className="text-xs text-gray-500 font-bold">{b.policyName}</p>
                <p className="text-sm font-bold">{b.available.toFixed(1)} <span className="text-xs font-normal text-gray-400">days</span></p>
              </div>
            ))}
          </>
        )}
        <a href="/time-off" className="block p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800/30 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors">
          <p className="text-xs font-medium text-primary-700 dark:text-primary-400 flex items-center gap-1">
            <Calendar size={12} /> View full time-off details →
          </p>
        </a>
      </CardContent>
    </Card>
  );
}

export function TeamWidget() {
  const { data: teamRequests, isLoading } = trpc.timeoff.teamCalendar.useQuery();

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Find who is actually out today
  const outToday = (teamRequests || []).filter((req: any) => {
    if (req.status !== 'APPROVED') return false;
    const start = format(new Date(req.startDate), 'yyyy-MM-dd');
    const end = format(new Date(req.endDate), 'yyyy-MM-dd');
    return todayStr >= start && todayStr <= end;
  });

  if (isLoading) return <div className="h-40 bg-gray-100 dark:bg-charcoal-800 animate-pulse rounded-xl" />;

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900">
      <CardHeader className="pb-2 border-b border-gray-50 dark:border-charcoal-800 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock size={16} className="text-secondary-500" />
          Who&apos;s Out
        </CardTitle>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-bold border-gray-200 text-gray-400">TODAY</Badge>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {outToday.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 italic">Everyone is in today! 🎉</p>
        ) : (
          outToday.slice(0, 6).map((req: any) => (
            <div key={req.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-8 w-8 ring-2 ring-white dark:ring-charcoal-900">
                    <AvatarFallback className="bg-primary-100 text-primary-600 text-[10px] font-bold">
                      {req.employee?.firstName?.[0]}{req.employee?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-charcoal-900 bg-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{req.employee?.firstName} {req.employee?.lastName}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{req.policy?.name} · until {format(new Date(req.endDate), 'MMM d')}</p>
                </div>
              </div>
              <p className="text-[10px] font-bold text-amber-500">OUT</p>
            </div>
          ))
        )}
        {outToday.length > 6 && <p className="text-[10px] text-gray-400 text-center">+{outToday.length - 6} more</p>}
        <a href="/time-off" className="block w-full text-center text-[10px] font-bold text-primary-500 pt-2 hover:text-primary-600 transition-colors uppercase tracking-widest">
          View full calendar
        </a>
      </CardContent>
    </Card>
  );
}
