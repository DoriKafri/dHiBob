"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface PolicyBalanceCardProps {
  policyName: string;
  accrued: number;
  used: number;
  available: number;
  projectedYearEnd: number;
}

export function PolicyBalanceCard({
  policyName,
  accrued,
  used,
  available,
  projectedYearEnd,
}: PolicyBalanceCardProps) {
  // Use HiBob "Lush" green for the progress bar
  const progress = Math.min(Math.max((used / (accrued || 1)) * 100, 0), 100);

  return (
    <Card className="rounded-lg border border-gray-200 dark:border-charcoal-700 bg-white dark:bg-charcoal-800 text-charcoal-900 dark:text-white shadow-sm overflow-hidden">
      <CardHeader className="p-6 flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="tracking-tight text-sm font-medium text-gray-500 dark:text-gray-400">
          {policyName}
        </CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-gray-400 hover:text-gray-500 transition-colors">
                <Info size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="p-3 bg-white dark:bg-charcoal-900 border dark:border-charcoal-700 shadow-lg rounded-lg">
              <div className="space-y-1.5">
                <div className="flex justify-between gap-8 text-xs">
                  <span className="text-gray-500">Accrued to date</span>
                  <span className="font-bold">{accrued.toFixed(2)} days</span>
                </div>
                <div className="flex justify-between gap-8 text-xs">
                  <span className="text-gray-500">Used</span>
                  <span className="font-bold text-rose-500">{used.toFixed(2)} days</span>
                </div>
                <div className="h-px bg-gray-100 dark:bg-charcoal-800 my-1" />
                <div className="flex justify-between gap-8 text-xs">
                  <span className="text-charcoal-900 dark:text-white font-bold">Current Balance</span>
                  <span className="font-bold text-emerald-500">{available.toFixed(2)} days</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-charcoal-900 dark:text-white">
            {available.toFixed(1)}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            days
          </span>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
            <span>{used.toFixed(1)} used</span>
            <span>{accrued.toFixed(1)} accrued</span>
          </div>
          <div className="h-2 w-full bg-gray-100 dark:bg-charcoal-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#10b981] rounded-full transition-all duration-500 ease-in-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-charcoal-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Projected by Dec 31st:{" "}
            <span className="font-semibold text-charcoal-800 dark:text-gray-200">
              {projectedYearEnd.toFixed(1)} days
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
