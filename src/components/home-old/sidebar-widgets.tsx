"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Plane, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

export function MeWidget() {
  const { data: employee, isLoading } = trpc.employee.list.useQuery({ limit: 1 });
  // For the MVP, we'll use the first employee returned since we're acting as the user.
  // In a real app, this would be the session user.
  const user = employee?.employees[0];

  if (isLoading) return <div className="h-40 bg-gray-100 dark:bg-charcoal-800 animate-pulse rounded-xl" />;
  if (!user) return null;

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 overflow-hidden">
      <CardHeader className="pb-2 border-b border-gray-50 dark:border-charcoal-800">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plane size={16} className="text-primary-500" />
          My Time Off
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Vacation</p>
            <p className="text-xl font-bold">14.5 <span className="text-xs font-normal text-gray-400">days</span></p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Sick Leave</p>
            <p className="text-xl font-bold">5.0 <span className="text-xs font-normal text-gray-400">days</span></p>
          </div>
        </div>
        
        <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800/30">
          <p className="text-xs font-medium text-primary-700 dark:text-primary-400 flex items-center gap-1 mb-1">
            <Calendar size={12} /> Next Holiday
          </p>
          <p className="text-sm font-bold text-primary-900 dark:text-primary-100">
            Good Friday (Apr 10, 2026)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamWidget() {
  const { data: teamData, isLoading } = trpc.employee.list.useQuery({ limit: 5 });
  const employees = teamData?.employees || [];

  if (isLoading) return <div className="h-60 bg-gray-100 dark:bg-charcoal-800 animate-pulse rounded-xl" />;

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
        {employees.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 italic">Everyone is in today!</p>
        ) : (
          employees.map((emp, i) => (
            <div key={emp.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-8 w-8 ring-2 ring-white dark:ring-charcoal-900 group-hover:ring-primary-50 transition-all">
                    <AvatarFallback className="bg-primary-100 text-primary-600 text-[10px] font-bold">
                      {emp.firstName[0]}{emp.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-charcoal-900 ${i === 0 ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium group-hover:text-primary-600 transition-colors">{emp.firstName} {emp.lastName}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{(emp as any).department?.name || 'General'}</p>
                </div>
              </div>
              <p className="text-[10px] font-bold text-gray-300">
                {i === 0 ? 'ON LEAVE' : 'IN'}
              </p>
            </div>
          ))
        )}
        <button className="w-full text-center text-[10px] font-bold text-primary-500 pt-2 hover:text-primary-600 transition-colors uppercase tracking-widest">
          View full calendar
        </button>
      </CardContent>
    </Card>
  );
}
