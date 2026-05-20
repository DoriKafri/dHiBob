"use client";
import { cn } from "@/lib/utils";

interface Column<T> { key: string; header: string; render?: (item: T) => React.ReactNode; className?: string; }
interface DataTableProps<T> { data: T[]; columns: Column<T>[]; onRowClick?: (item: T) => void; className?: string; }

export function DataTable<T extends Record<string, any>>({ data, columns, onRowClick, className }: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border dark:border-charcoal-700", className)}>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-charcoal-800 border-b dark:border-charcoal-700">
          <tr>{columns.map(col => <th key={col.key} className={cn("px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400", col.className)}>{col.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y dark:divide-charcoal-700">
          {data.map((item, i) => (
            <tr key={i} onClick={() => onRowClick?.(item)} className={cn("hover:bg-gray-50 dark:hover:bg-charcoal-800", onRowClick && "cursor-pointer")}>
              {columns.map(col => <td key={col.key} className={cn("px-4 py-3", col.className)}>{col.render ? col.render(item) : item[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
