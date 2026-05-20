"use client";
import { useState } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format,
  isWithinInterval, addMonths, subMonths, getDay, startOfDay, endOfDay
} from "date-fns";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_COLORS: Record<string, string> = {
  VACATION: "bg-blue-100 text-blue-800",
  SICK: "bg-red-100 text-red-800",
  PERSONAL: "bg-purple-100 text-purple-800",
  UNPAID: "bg-gray-100 text-gray-800",
};

export default function CalendarView() {
  const { data: session } = useSession();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const { data, isLoading } = trpc.timeoff.listRequests.useQuery(
    {
      status: "APPROVED",
      employeeId: session?.user?.employeeId,
      limit: 100,
    },
    { enabled: !!session?.user?.employeeId }
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Offset to align first day with correct column (0=Sun)
  const startPadding = getDay(monthStart);

  function getRequestForDay(day: Date) {
    const normalizedDay = startOfDay(day);
    return data?.requests.find((req) => {
      const start = startOfDay(new Date(req.startDate));
      const end = endOfDay(new Date(req.endDate));
      return isWithinInterval(normalizedDay, { start, end });
    });
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft size={16} />
        </Button>
        <h3 data-testid="month-header" className="text-lg font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
        {DOW_LABELS.map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* Days grid */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {/* Padding cells */}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map((day) => {
            const req = getRequestForDay(day);
            const colorClass = req ? (TYPE_COLORS[req.policy.type] ?? "bg-green-100 text-green-800") : "";
            return (
              <div
                key={day.toISOString()}
                className={`p-1 rounded text-center text-sm min-h-[2.5rem] flex flex-col items-center justify-start ${colorClass}`}
                title={req ? `${req.policy.name}` : undefined}
              >
                <span className="font-medium">{format(day, "d")}</span>
                {req && (
                  <span className="text-[10px] leading-tight mt-0.5 truncate w-full text-center">
                    {req.policy.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
