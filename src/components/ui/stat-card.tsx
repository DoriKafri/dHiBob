import { cn } from "@/lib/utils";
import { Card, CardContent } from "./card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps { title: string; value: string | number; change?: number; changeLabel?: string; icon?: React.ReactNode; className?: string; }

export function StatCard({ title, value, change, changeLabel, icon, className }: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          {icon && <div className="text-gray-400">{icon}</div>}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
          {change !== undefined && (
            <span className={cn("flex items-center text-sm font-medium", isPositive ? "text-green-600 dark:text-green-400" : isNegative ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400")}>
              {isPositive ? <TrendingUp size={14} /> : isNegative ? <TrendingDown size={14} /> : <Minus size={14} />}
              {Math.abs(change)}%
            </span>
          )}
        </div>
        {changeLabel && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{changeLabel}</p>}
      </CardContent>
    </Card>
  );
}
