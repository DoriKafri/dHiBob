/**
 * Notification event type constants.
 * Shared between client and server — must not import from server modules,
 * Prisma, or any Node.js-only dependencies.
 */
export const NOTIFICATION_EVENT_TYPES = [
  'TIMEOFF_REQUEST',
  'TIMEOFF_APPROVED',
  'TIMEOFF_REJECTED',
  'DOCUMENT_SIGNED',
  'DOCUMENT_PENDING_SIGNATURE',
  'DOCUMENT_DECLINED',
  'EMPLOYEE_UPDATED',
  'TASK_ASSIGNED',
  'SURVEY_PUBLISHED',
  'HR_ANNOUNCEMENT',
  'SYSTEM',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
