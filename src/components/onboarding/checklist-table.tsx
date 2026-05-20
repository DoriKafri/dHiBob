"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { trpc } from '@/lib/trpc';

interface Assignee {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

interface ChecklistTask {
  id: string;
  title: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  dueDate?: Date | string | null;
  notes?: string | null;
  assignee?: Assignee | null;
}

interface ChecklistSection {
  section: string;
  tasks: ChecklistTask[];
}

interface ChecklistTableProps {
  sections: ChecklistSection[];
  onStatusChange?: (taskId: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE') => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onTaskUpdate?: (taskId: string, field: 'title' | 'notes' | 'dueDate', value: string | null) => void;
  onTaskDelete?: (taskId: string) => void;
  readonly?: boolean;
}

// Inline editable text cell — click to edit, blur/Enter to save
function EditableCell({ value, onSave, placeholder, className }: {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 -mx-1 min-h-[1.25rem] inline-block ${className ?? ''}`}
        title="Click to edit"
      >
        {value || <span className="text-gray-400">{placeholder ?? '—'}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
      className="w-full border-b border-primary-400 outline-none bg-transparent text-sm py-0.5"
      placeholder={placeholder}
    />
  );
}

// Inline editable date cell
function EditableDateCell({ value, onSave }: {
  value: string;
  onSave: (val: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert display date to ISO for the input
  const isoValue = value && !value.includes('-')
    ? (() => { try { return new Date(value).toISOString().slice(0, 10); } catch { return ''; } })()
    : (value || '');

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 -mx-1 min-h-[1.25rem] inline-block text-gray-500 text-xs whitespace-nowrap"
        title="Click to edit"
      >
        {value ? formatDate(value) : <span className="text-gray-400">—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="date"
      defaultValue={isoValue}
      onBlur={e => { setEditing(false); onSave(e.target.value || null); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
      className="border-b border-primary-400 outline-none bg-transparent text-xs py-0.5"
    />
  );
}

function AssigneeAvatar({ assignee }: { assignee: Assignee | null | undefined }) {
  if (!assignee) return <span className="text-gray-400">—</span>;
  if (assignee.avatar) {
    return (
      <img
        src={assignee.avatar}
        alt={`${assignee.firstName} ${assignee.lastName}`}
        className="w-7 h-7 rounded-full object-cover"
        title={`${assignee.firstName} ${assignee.lastName}`}
      />
    );
  }
  const initials = `${assignee.firstName[0]}${assignee.lastName[0]}`.toUpperCase();
  return (
    <span
      className="w-7 h-7 rounded-full bg-purple-500 text-white text-xs font-medium inline-flex items-center justify-center"
      title={`${assignee.firstName} ${assignee.lastName}`}
    >
      {initials}
    </span>
  );
}

function AssigneePicker({ taskId, assignee, onAssigneeChange }: {
  taskId: string;
  assignee: Assignee | null | undefined;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { data: employees } = trpc.employee.list.useQuery(
    { limit: 100 },
    { enabled: open }
  );

  const empList = (employees?.employees ?? []) as any[];

  function openDropdown() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
  }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="hover:opacity-80 cursor-pointer"
        title={assignee ? `${assignee.firstName} ${assignee.lastName} — click to change` : 'Assign someone'}
      >
        <AssigneeAvatar assignee={assignee} />
      </button>
      {open && coords && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[101] bg-white dark:bg-charcoal-900 border border-gray-200 dark:border-charcoal-700 rounded-md shadow-xl py-1 min-w-[200px] max-h-[260px] overflow-y-auto"
            style={{ top: coords.top, left: coords.left }}
          >
            <button
              type="button"
              onClick={() => { onAssigneeChange(taskId, null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-charcoal-800 text-gray-400"
            >
              No one assigned
            </button>
            {empList.map((emp: any) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => { onAssigneeChange(taskId, emp.id); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-charcoal-800 flex items-center gap-2 ${assignee?.id === emp.id ? 'font-semibold' : ''}`}
              >
                {emp.avatar ? (
                  <img src={emp.avatar} className="w-5 h-5 rounded-full object-cover" alt="" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-medium inline-flex items-center justify-center">
                    {emp.firstName?.[0]}{emp.lastName?.[0]}
                  </span>
                )}
                {emp.firstName} {emp.lastName}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChecklistTable({ sections, onStatusChange, onAssigneeChange, onTaskUpdate, onTaskDelete, readonly = false }: ChecklistTableProps) {
  if (sections.length === 0) return <p className="text-sm text-gray-500 py-4">No tasks yet.</p>;

  return (
    <div className="space-y-4">
      {sections.map(({ section, tasks }) => (
        <div key={section}>
          {/* Section header */}
          <div className="flex items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700 mb-1">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{section}</span>
            <span className="text-xs text-gray-400">({tasks.length})</span>
          </div>
          <table className="w-full text-sm" data-testid={`section-${section}`}>
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-1 pl-2 font-normal w-6"></th>
                <th className="text-left py-1 font-normal">Item</th>
                <th className="text-left py-1 px-4 font-normal w-20">Person</th>
                <th className="text-left py-1 px-4 font-normal w-36">Status</th>
                <th className="text-left py-1 px-4 font-normal w-28">Date</th>
                <th className="text-left py-1 px-4 font-normal min-w-[120px]">Notes</th>
                {!readonly && onTaskDelete && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2 pl-2">
                    <input
                      type="checkbox"
                      checked={task.status === 'DONE'}
                      onChange={() => {
                        if (!readonly && onStatusChange) {
                          onStatusChange(task.id, task.status === 'DONE' ? 'NOT_STARTED' : 'DONE');
                        }
                      }}
                      className="rounded border-gray-300"
                      aria-label={`Mark ${task.title} as done`}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {!readonly && onTaskUpdate ? (
                      <EditableCell
                        value={task.title}
                        onSave={val => onTaskUpdate(task.id, 'title', val)}
                        placeholder="Task name"
                        className={task.status === 'DONE' ? 'line-through text-gray-400' : ''}
                      />
                    ) : (
                      <span className={task.status === 'DONE' ? 'line-through text-gray-400' : ''}>
                        {task.title}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4">
                    {!readonly && onAssigneeChange ? (
                      <AssigneePicker
                        taskId={task.id}
                        assignee={task.assignee}
                        onAssigneeChange={onAssigneeChange}
                      />
                    ) : (
                      <AssigneeAvatar assignee={task.assignee} />
                    )}
                  </td>
                  <td className="py-2 px-4">
                    <StatusBadge
                      status={task.status}
                      onStatusChange={readonly ? undefined : (next) => onStatusChange?.(task.id, next)}
                      readonly={readonly}
                    />
                  </td>
                  <td className="py-2 px-4">
                    {!readonly && onTaskUpdate ? (
                      <EditableDateCell
                        value={task.dueDate ? (typeof task.dueDate === 'string' ? task.dueDate : (task.dueDate as Date).toISOString()) : ''}
                        onSave={val => onTaskUpdate(task.id, 'dueDate', val)}
                      />
                    ) : (
                      <span className="text-gray-500 text-xs whitespace-nowrap">{formatDate(task.dueDate)}</span>
                    )}
                  </td>
                  <td className="py-2 px-4">
                    {!readonly && onTaskUpdate ? (
                      <EditableCell
                        value={task.notes ?? ''}
                        onSave={val => onTaskUpdate(task.id, 'notes', val || null)}
                        placeholder="Add note..."
                        className="text-gray-500 text-xs"
                      />
                    ) : (
                      <span className="text-gray-500 text-xs">{task.notes ?? ''}</span>
                    )}
                  </td>
                  {!readonly && onTaskDelete && (
                    <td className="py-2 px-1">
                      <button
                        type="button"
                        onClick={() => { if (confirm('Are you sure you want to delete this task?')) onTaskDelete(task.id); }}
                        className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-400 hover:text-red-600 transition-colors"
                        title="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
