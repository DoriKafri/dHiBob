"use client";

import { useEffect, useRef } from "react";
import { trpc } from "../trpc";

/**
 * React hook that opens an SSE connection to /api/notifications/sse.
 * On receiving a notification event, it invalidates the tRPC notification queries
 * so the popover updates in real-time without polling.
 *
 * Reconnects with exponential backoff on disconnection.
 */
export function useNotificationSSE() {
  const utils = trpc.useUtils();
  const retryCount = useRef(0);
  const maxRetryDelay = 30_000; // 30 seconds max

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      eventSource = new EventSource("/api/notifications/sse");

      eventSource.onopen = () => {
        retryCount.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "notification") {
            // Invalidate the notification queries to trigger re-fetch
            utils.notifications.list.invalidate();
            utils.notifications.unreadCount.invalidate();
          }
        } catch {
          // Ignore malformed messages
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;

        if (!isMounted) return;

        // Exponential backoff: 1s, 2s, 4s, 8s, ... up to maxRetryDelay
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), maxRetryDelay);
        retryCount.current++;
        timeoutId = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      isMounted = false;
      eventSource?.close();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [utils]);
}
