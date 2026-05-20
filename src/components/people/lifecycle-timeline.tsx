"use client";

import { Sparkles, Rocket, Building, Users, DollarSign, MessageSquare, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AddMilestoneModal } from "./add-milestone-modal";
import { useSession } from "next-auth/react";

interface LifecycleTimelineProps {
  employeeId: string;
}

const TYPE_ICONS = {
  HIRED: Sparkles,
  PROMOTION: Rocket,
  DEPT_CHANGE: Building,
  MANAGER_CHANGE: Users,
  COMPENSATION: DollarSign,
  NOTE: MessageSquare,
};

const TYPE_COLORS = {
  HIRED: "bg-emerald-100 text-emerald-600 border-emerald-200",
  PROMOTION: "bg-cherry/10 text-cherry border-cherry/20",
  DEPT_CHANGE: "bg-blue-100 text-blue-600 border-blue-200",
  MANAGER_CHANGE: "bg-purple-100 text-purple-600 border-purple-200",
  COMPENSATION: "bg-amber-100 text-amber-600 border-amber-200",
  NOTE: "bg-gray-100 text-gray-600 border-gray-200",
};

export function LifecycleTimeline({ employeeId }: LifecycleTimelineProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'SUPER_ADMIN' || session?.user.role === 'ADMIN' || session?.user.role === 'HR';
  const [modalOpen, setModalOpen] = useState(false);
  const { data: events, isLoading } = trpc.employee.getTimeline.useQuery({ id: employeeId });

  if (isLoading) return <div className="p-12 text-center text-gray-400 animate-pulse">Loading journey...</div>;

  return (
    <div className="space-y-8 relative">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Career Journey</h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setModalOpen(true)} className="h-8 text-xs font-bold uppercase tracking-tight">
            <Plus size={14} className="mr-1.5" /> Add Milestone
          </Button>
        )}
      </div>

      <div className="relative pl-8 sm:pl-12">
        {/* The Vertical Line */}
        <div className="absolute left-[1.125rem] sm:left-[1.625rem] top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-charcoal-800" />

        <div className="space-y-12">
          {events?.length === 0 ? (
            <p className="text-sm text-gray-500 italic pl-4">No milestones recorded yet.</p>
          ) : (
            events?.map((event, idx) => {
              const Icon = TYPE_ICONS[event.type as keyof typeof TYPE_ICONS] || MessageSquare;
              const colorClass = TYPE_COLORS[event.type as keyof typeof TYPE_COLORS] || TYPE_COLORS.NOTE;

              return (
                <div key={event.id || idx} className="relative group animate-fade-in">
                  {/* Dot/Icon Node */}
                  <div className={cn(
                    "absolute -left-8 sm:-left-12 mt-1 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-4 border-white dark:border-charcoal-900 z-10 flex items-center justify-center transition-transform group-hover:scale-110",
                    colorClass
                  )}>
                    <Icon size={12} className="sm:w-4 sm:h-4" />
                  </div>

                  {/* Content Card */}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1">
                      {format(new Date(event.date), 'MMMM d, yyyy')}
                    </p>
                    <Card className="border-none shadow-sm bg-white dark:bg-charcoal-900 p-4 group-hover:shadow-md transition-shadow">
                      <h3 className="font-bold text-charcoal-900 dark:text-white leading-none mb-1">{event.title}</h3>
                      {event.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{event.description}</p>
                      )}
                    </Card>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <AddMilestoneModal 
        employeeId={employeeId} 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
      />
    </div>
  );
}
