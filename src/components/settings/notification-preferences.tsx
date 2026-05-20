"use client";

import { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { Bell, Mail, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notification-event-types";

type EventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

const EVENT_TYPES: readonly { key: EventType; label: string }[] = [
  { key: "TIMEOFF_REQUEST", label: "Time-off requests" },
  { key: "TIMEOFF_APPROVED", label: "Time-off approved" },
  { key: "TIMEOFF_REJECTED", label: "Time-off rejected" },
  { key: "DOCUMENT_SIGNED", label: "Document signed" },
  { key: "DOCUMENT_PENDING_SIGNATURE", label: "Document pending signature" },
  { key: "EMPLOYEE_UPDATED", label: "Employee profile updates" },
  { key: "TASK_ASSIGNED", label: "Task assignments" },
  { key: "SURVEY_PUBLISHED", label: "Survey published" },
  { key: "HR_ANNOUNCEMENT", label: "HR announcements" },
  { key: "SYSTEM", label: "System notices" },
] as const;

interface PrefState {
  inApp: boolean;
  email: boolean;
  slack: boolean;
}

const DEFAULT_PREF: PrefState = { inApp: true, email: true, slack: true };

export function NotificationPreferences() {
  const { data: preferences, isLoading } = trpc.notifications.getPreferences.useQuery();
  const utils = trpc.useUtils();
  const upsert = trpc.notifications.upsertPreference.useMutation({
    onSuccess: () => utils.notifications.getPreferences.invalidate(),
    onError: () => {
      // Revert optimistic toggle on failure by re-syncing from server
      utils.notifications.getPreferences.invalidate();
    },
  });
  const reset = trpc.notifications.resetPreferences.useMutation({
    onSuccess: () => utils.notifications.getPreferences.invalidate(),
  });

  // Build a local map from the fetched preferences
  const [prefMap, setPrefMap] = useState<Record<string, PrefState>>({});

  useEffect(() => {
    if (!preferences) return;
    const map: Record<string, PrefState> = {};
    for (const p of preferences) {
      map[p.eventType] = { inApp: p.inApp, email: p.email, slack: p.slack };
    }
    setPrefMap(map);
  }, [preferences]);

  function getPref(eventType: string): PrefState {
    return prefMap[eventType] ?? DEFAULT_PREF;
  }

  function toggleChannel(eventType: EventType, channel: keyof PrefState) {
    const current = getPref(eventType);
    const updated = { ...current, [channel]: !current[channel] };
    setPrefMap(prev => ({ ...prev, [eventType]: updated }));
    upsert.mutate({ eventType, ...updated });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-charcoal-700 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-charcoal-900 dark:text-white">Notification Preferences</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose how you want to be notified for each event type.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reset.mutate()}
          className="flex items-center gap-1.5"
          disabled={reset.isPending}
        >
          <RotateCcw size={14} />
          Reset to defaults
        </Button>
      </div>

      <div className="border border-gray-200 dark:border-charcoal-700 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 px-4 py-3 bg-gray-50 dark:bg-charcoal-700 border-b border-gray-200 dark:border-charcoal-600">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Notification Type</div>
          <div className="flex justify-center">
            <span className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-300" title="In-App">
              <Bell size={14} /> In-App
            </span>
          </div>
          <div className="flex justify-center">
            <span className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-300" title="Email">
              <Mail size={14} /> Email
            </span>
          </div>
          <div className="flex justify-center">
            <span className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-300" title="Slack">
              <MessageSquare size={14} /> Slack
            </span>
          </div>
        </div>

        {/* Rows */}
        {EVENT_TYPES.map(({ key, label }) => {
          const pref = getPref(key);
          return (
            <div
              key={key}
              className="grid grid-cols-[1fr_80px_80px_80px] gap-2 px-4 py-3 border-b border-gray-100 dark:border-charcoal-700 last:border-0 hover:bg-gray-50 dark:hover:bg-charcoal-750 transition-colors"
            >
              <div className="text-sm text-charcoal-900 dark:text-white flex items-center">{label}</div>
              <div className="flex justify-center">
                <ToggleSwitch checked={pref.inApp} onChange={() => toggleChannel(key, "inApp")} />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch checked={pref.email} onChange={() => toggleChannel(key, "email")} />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch checked={pref.slack} onChange={() => toggleChannel(key, "slack")} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`
        relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${checked ? "bg-primary-500" : "bg-gray-300 dark:bg-charcoal-600"}
      `}
    >
      <span
        className={`
          inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
          ${checked ? "translate-x-4" : "translate-x-0.5"}
        `}
      />
    </button>
  );
}
