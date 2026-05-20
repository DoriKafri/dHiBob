import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Bell, Calendar, CheckSquare, ClipboardList, Megaphone, Check } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { useNotificationSSE } from "../../lib/hooks/use-notification-sse";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  TIMEOFF_APPROVED:  { icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  TIMEOFF_REJECTED:  { icon: Calendar, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  TIMEOFF_REQUEST:   { icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  TASK_ASSIGNED:     { icon: CheckSquare, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  SURVEY_PUBLISHED:  { icon: ClipboardList, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  HR_ANNOUNCEMENT:   { icon: Megaphone, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
};

function timeAgo(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function NotificationsPopover() {
  const router = useRouter();
  const utils = trpc.useUtils();
  useNotificationSSE(); // Real-time SSE updates
  const { data: notifications } = trpc.notifications.list.useQuery();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery();
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); },
  });

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative text-gray-700 dark:text-gray-300">
          <Bell size={20} />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
              {unreadCount! > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className="z-50 w-96 rounded-lg border border-gray-200 dark:border-charcoal-700 bg-white dark:bg-charcoal-800 shadow-xl outline-none"
        >
          <div className="p-4 border-b border-gray-100 dark:border-charcoal-700 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {(unreadCount ?? 0) > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={32} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No notifications yet.</p>
              </div>
            ) : (
              <div>
                {notifications.map((notif: any) => {
                  const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.HR_ANNOUNCEMENT;
                  const Icon = config.icon;
                  return (
                    <button
                      key={notif.id}
                      onClick={() => {
                        if (!notif.read) markRead.mutate({ id: notif.id });
                        if (notif.linkUrl) router.push(notif.linkUrl);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-charcoal-700 flex items-start gap-3 transition-colors border-b border-gray-50 dark:border-charcoal-700 last:border-0 ${!notif.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 ${config.bg}`}>
                        <Icon size={16} className={config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${!notif.read ? 'font-semibold dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {notif.title}
                        </p>
                        {notif.message && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(notif.createdAt)}</p>
                      </div>
                      {!notif.read && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
