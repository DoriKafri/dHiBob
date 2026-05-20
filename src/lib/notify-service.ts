/**
 * Centralized notification service.
 * Single entry point for all notification dispatch: in-app, email, Slack.
 * Respects per-user, per-event-type preferences (opt-out model).
 */
import { prisma } from "./db";
import { sseManager } from "./sse-manager";
import { sendEmail, isEmailConfigured } from "./channels/email";
import { sendSlackDM, isSlackConfigured } from "./channels/slack";

export interface NotifyPayload {
  companyId: string;
  recipients: string[];   // employee IDs
  eventType: string;      // matches NotificationPreference.eventType
  title: string;
  message?: string;
  linkUrl?: string;       // relative path for in-app link
  emailSubject?: string;  // falls back to title
  emailBody?: string;     // falls back to message
}

interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  slack: boolean;
}

const DEFAULT_PREFS: ChannelPrefs = { inApp: true, email: true, slack: true };

/**
 * Send notifications to multiple recipients across all enabled channels.
 * Gracefully degrades: missing API keys skip that channel silently.
 * Errors on one channel do not block other channels.
 */
export async function send(payload: NotifyPayload): Promise<void> {
  if (!payload.recipients.length) return;

  // 1. Batch-fetch preferences for all recipients + this event type
  const prefRows = await prisma.notificationPreference.findMany({
    where: {
      employeeId: { in: payload.recipients },
      eventType: payload.eventType,
    },
  });
  const prefMap = new Map(prefRows.map(p => [p.employeeId, { inApp: p.inApp, email: p.email, slack: p.slack }]));

  // 2. Batch-fetch employee details for email/Slack channels (scoped to company)
  const employees = await prisma.employee.findMany({
    where: { id: { in: payload.recipients }, companyId: payload.companyId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const empMap = new Map(employees.map(e => [e.id, e]));

  // 3. Fan out per recipient
  const tasks: Promise<void>[] = [];

  for (const recipientId of payload.recipients) {
    const prefs = prefMap.get(recipientId) ?? DEFAULT_PREFS;
    const emp = empMap.get(recipientId);
    if (!emp) continue;

    // IN_APP
    if (prefs.inApp) {
      tasks.push(
        sendInApp(payload, recipientId).catch(err =>
          console.error("[notify:inApp] failed for", recipientId, err)
        )
      );
    }

    // EMAIL
    if (prefs.email && isEmailConfigured()) {
      tasks.push(
        sendEmail(
          { email: emp.email, firstName: emp.firstName },
          {
            subject: payload.emailSubject ?? payload.title,
            body: payload.emailBody ?? payload.message ?? "",
            linkPath: payload.linkUrl,
          }
        ).catch(err =>
          console.error("[notify:email] failed for", recipientId, err)
        )
      );
    }

    // SLACK — uses general title/message (not email-specific overrides)
    if (prefs.slack && isSlackConfigured()) {
      tasks.push(
        sendSlackDM(
          { email: emp.email },
          {
            subject: payload.title,
            body: payload.message ?? "",
            linkPath: payload.linkUrl,
          }
        ).catch(err =>
          console.error("[notify:slack] failed for", recipientId, err)
        )
      );
    }
  }

  await Promise.all(tasks);
}

async function sendInApp(payload: NotifyPayload, recipientId: string): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      companyId: payload.companyId,
      employeeId: recipientId,
      type: payload.eventType,
      title: payload.title,
      message: payload.message,
      linkUrl: payload.linkUrl,
      channel: "IN_APP",
    },
  });

  // Push via SSE to connected clients
  sseManager.push(recipientId, {
    type: "notification",
    data: notification,
  });
}

export const notifyService = { send };
