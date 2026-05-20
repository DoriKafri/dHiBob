"use client";

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { ChecklistTable } from './checklist-table';
import { AddTaskModal } from './add-task-modal';
import { trpc } from '@/lib/trpc';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  department?: { name: string } | null;
  onboardingTasks?: Array<{ status: string }>;
  offboardingTasks?: Array<{ status: string }>;
}

interface EmployeeChecklistRowProps {
  employee: Employee;
  mode: 'onboarding' | 'offboarding';
  isDevOps?: boolean;
}

export function EmployeeChecklistRow({ employee, mode, isDevOps = false }: EmployeeChecklistRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const utils = trpc.useUtils();

  const tasks = mode === 'onboarding' ? (employee.onboardingTasks ?? []) : (employee.offboardingTasks ?? []);
  const done = tasks.filter(t => t.status === 'DONE').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Lazy-load the full checklist when expanded
  const checklistQuery = mode === 'onboarding'
    ? trpc.onboarding.getChecklist.useQuery(
        { employeeId: employee.id },
        { enabled: expanded }
      )
    : trpc.onboarding.getOffboardingChecklist.useQuery(
        { employeeId: employee.id },
        { enabled: expanded }
      );

  const updateOnboarding = trpc.onboarding.updateTaskStatus.useMutation({
    onSuccess: () => {
      utils.onboarding.listNewHires.invalidate();
      utils.onboarding.getChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const updateOffboarding = trpc.onboarding.updateOffboardingTaskStatus.useMutation({
    onSuccess: () => {
      utils.onboarding.listOffboarding.invalidate();
      utils.onboarding.getOffboardingChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const assignOnboarding = trpc.onboarding.updateTaskAssignee.useMutation({
    onSuccess: () => {
      utils.onboarding.getChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const assignOffboarding = trpc.onboarding.updateOffboardingTaskAssignee.useMutation({
    onSuccess: () => {
      utils.onboarding.getOffboardingChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const handleStatusChange = (taskId: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE') => {
    if (mode === 'onboarding') {
      updateOnboarding.mutate({ taskId, status });
    } else {
      updateOffboarding.mutate({ taskId, status });
    }
  };

  const handleAssigneeChange = (taskId: string, assigneeId: string | null) => {
    if (mode === 'onboarding') {
      assignOnboarding.mutate({ taskId, assigneeId });
    } else {
      assignOffboarding.mutate({ taskId, assigneeId });
    }
  };

  const editOnboarding = trpc.onboarding.updateTask.useMutation({
    onSuccess: () => {
      utils.onboarding.getChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const editOffboarding = trpc.onboarding.updateOffboardingTask.useMutation({
    onSuccess: () => {
      utils.onboarding.getOffboardingChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const deleteOnboardingTask = trpc.onboarding.deleteTask.useMutation({
    onSuccess: () => {
      utils.onboarding.listNewHires.invalidate();
      utils.onboarding.getChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const deleteOffboardingTask = trpc.onboarding.deleteOffboardingTask.useMutation({
    onSuccess: () => {
      utils.onboarding.listOffboarding.invalidate();
      utils.onboarding.getOffboardingChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const handleTaskDelete = (taskId: string) => {
    if (mode === 'onboarding') {
      deleteOnboardingTask.mutate({ taskId });
    } else {
      deleteOffboardingTask.mutate({ taskId });
    }
  };

  const handleTaskUpdate = (taskId: string, field: 'title' | 'notes' | 'dueDate', value: string | null) => {
    const payload: any = { taskId };
    if (field === 'dueDate') {
      payload.dueDate = value ? new Date(value) : null;
    } else {
      payload[field] = value;
    }
    if (mode === 'onboarding') {
      editOnboarding.mutate(payload);
    } else {
      editOffboarding.mutate(payload);
    }
  };

  const name = `${employee.firstName} ${employee.lastName}`;
  const dateLabel = mode === 'onboarding'
    ? `Starts ${new Date(employee.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : employee.endDate
      ? `Ended ${new Date(employee.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'End date TBD';

  // Filter out DevOps section for non-DevOps employees
  const rawSections = (checklistQuery.data ?? []) as Array<{
    section: string;
    sectionType?: string;
    tasks: Array<{
      id: string;
      title: string;
      status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
      dueDate?: Date | string | null;
      notes?: string | null;
      assignee?: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
    }>;
  }>;
  const sections = rawSections.filter(s =>
    isDevOps || s.sectionType !== 'DEVOPS'
  );

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-label={name}
      >
        {expanded ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}

        {/* Avatar */}
        {employee.avatar ? (
          <img src={employee.avatar} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-medium inline-flex items-center justify-center shrink-0">
            {employee.firstName[0]}{employee.lastName[0]}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{name}</p>
          <p className="text-xs text-gray-500">{employee.department?.name ?? ''} · {dateLabel}</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-2 bg-emerald-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
              aria-label={`${pct}% complete`}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
        </div>
      </button>

      {/* Expanded checklist */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
          {checklistQuery.isLoading && <p className="text-sm text-gray-500 py-4">Loading tasks...</p>}
          {!checklistQuery.isLoading && (
            <>
              <ChecklistTable
                sections={sections}
                onStatusChange={handleStatusChange}
                onAssigneeChange={handleAssigneeChange}
                onTaskUpdate={handleTaskUpdate}
                onTaskDelete={handleTaskDelete}
              />
              <button
                type="button"
                onClick={() => setAddTaskOpen(true)}
                className="mt-3 flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium"
              >
                <Plus size={14} /> Add task
              </button>
              <AddTaskModal
                employeeId={employee.id}
                employeeName={name}
                mode={mode}
                open={addTaskOpen}
                onOpenChange={setAddTaskOpen}
                onTaskAdded={() => {
                  checklistQuery.refetch();
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
