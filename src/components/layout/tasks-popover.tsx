import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CheckSquare, Circle, CheckCircle2, Clock } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

const STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  NOT_STARTED: { icon: Circle, color: 'text-gray-400', label: 'Not started' },
  IN_PROGRESS: { icon: Clock, color: 'text-amber-500', label: 'In progress' },
  DONE: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Done' },
};

export function TasksPopover() {
  const router = useRouter();
  const { data: tasks } = trpc.onboarding.myTasks.useQuery();
  const pendingCount = tasks?.filter((t: any) => t.status !== 'DONE').length ?? 0;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative text-gray-700 dark:text-gray-300">
          <CheckSquare size={20} />
          {pendingCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
              {pendingCount}
            </span>
          )}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-gray-200 dark:border-charcoal-700 bg-white dark:bg-charcoal-800 shadow-xl outline-none"
        >
          <div className="p-4 border-b border-gray-100 dark:border-charcoal-700 flex items-center justify-between">
            <h3 className="font-semibold text-sm">My Tasks</h3>
            {pendingCount > 0 && (
              <span className="text-xs text-gray-500">{pendingCount} pending</span>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {!tasks || tasks.length === 0 ? (
              <div className="p-6 text-center">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400 opacity-50" />
                <p className="text-sm text-gray-500 dark:text-gray-400">All caught up!</p>
                <p className="text-xs text-gray-400">No tasks assigned to you.</p>
              </div>
            ) : (
              <div className="py-1">
                {tasks.map((task: any) => {
                  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.NOT_STARTED;
                  const Icon = config.icon;
                  return (
                    <button
                      key={task.id}
                      onClick={() => router.push('/onboarding')}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-charcoal-700 flex items-start gap-3 transition-colors"
                    >
                      <Icon size={16} className={`${config.color} mt-0.5 shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate dark:text-white">{task.title}</p>
                        <p className="text-[11px] text-gray-400">{config.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="p-2 border-t border-gray-100 dark:border-charcoal-700">
            <button
              onClick={() => router.push('/onboarding')}
              className="w-full text-center text-xs text-primary-500 hover:text-primary-600 font-medium py-1.5"
            >
              View all tasks →
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
