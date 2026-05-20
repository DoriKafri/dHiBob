import React, { useMemo } from 'react';
import { 
  format, 
  eachDayOfInterval, 
  startOfMonth, 
  endOfMonth, 
  startOfDay,
  parseISO
} from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';

interface TeamTimelineProps {
  currentMonth: Date;
  requests: any[];
  teamMembers: any[];
}

const POLICY_COLORS: Record<string, string> = {
  VACATION: 'bg-emerald-500',
  SICK: 'bg-amber-500',
  PERSONAL: 'bg-indigo-500',
  UNPAID: 'bg-slate-500',
};

const ensureDate = (d: any) => {
  if (!d) return new Date();
  const date = typeof d === 'string' ? parseISO(d) : new Date(d);
  return startOfDay(date);
};

export function TeamTimeline({ currentMonth, requests, teamMembers }: TeamTimelineProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Map requests to a simpler structure with timestamps for fast, robust matching
  const requestLookup = useMemo(() => {
    const map = new Map<string, any[]>();
    requests.forEach(r => {
      if (r.status === 'REJECTED') return;
      // Convert to timestamps for direct comparison
      const start = ensureDate(r.startDate).getTime();
      const end = ensureDate(r.endDate).getTime();
      const key = r.employeeId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ ...r, startTs: start, endTs: end });
    });
    return map;
  }, [requests]);

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 overflow-hidden">
      <CardHeader className="pb-0 border-b border-gray-50 dark:border-charcoal-800">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-gray-400">Team Availability</CardTitle>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-tighter">
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Vacation</div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Sick</div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Personal</div>
          </div>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Header Row (Days) */}
          <div className="flex border-b border-gray-50 dark:border-charcoal-800">
            <div className="w-48 sticky left-0 bg-white dark:bg-charcoal-900 z-10 border-r border-gray-50 dark:border-charcoal-800 p-2" />
            {days.map((day) => (
              <div 
                key={day.toISOString()} 
                className="w-10 h-10 flex flex-col items-center justify-center border-r border-gray-50 dark:border-charcoal-800 text-[10px] font-bold"
              >
                <span className="text-gray-400">{format(day, 'EEE')[0]}</span>
                <span className="text-gray-600 dark:text-gray-300">{format(day, 'd')}</span>
              </div>
            ))}
          </div>

          {/* Employee Rows */}
          {teamMembers.map(member => {
            const memberRequests = requestLookup.get(member.id) || [];
            return (
              <div key={member.id} className="flex border-b border-gray-50 dark:border-charcoal-800 hover:bg-gray-50 dark:hover:bg-charcoal-800/50 transition-colors">
                <div className="w-48 sticky left-0 bg-white dark:bg-charcoal-900 z-10 border-r border-gray-50 dark:border-charcoal-800 p-2 flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary-100 text-primary-600 text-[8px] font-bold">
                      {member.firstName[0]}{member.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium truncate">{member.firstName} {member.lastName}</span>
                </div>
                {days.map(day => {
                  const dayTs = startOfDay(day).getTime();
                  // A request covers this day if dayTs is between startTs and endTs (inclusive)
                  const req = memberRequests.find(r => dayTs >= r.startTs && dayTs <= r.endTs);
                  
                  const isApproved = req?.status === 'APPROVED';
                  const color = req ? (POLICY_COLORS[req.policy?.type] || 'bg-primary-500') : '';

                  return (
                    <div key={day.toISOString()} className="w-10 h-10 border-r border-gray-50 dark:border-charcoal-800 flex items-center justify-center">
                      {req && (
                        <div 
                          className={`w-6 h-6 rounded-full ${color} ${isApproved ? 'shadow-sm' : 'opacity-40 stripe-bg'} transition-all flex items-center justify-center text-[8px] text-white font-bold ring-2 ring-white dark:ring-charcoal-900`} 
                          title={`${member.firstName}: ${req.policy?.name || 'Leave'} (${req.status})`}
                        >
                          {!isApproved && '?'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
