# Multi-Channel Notification System Design

## Overview
A centralized, multi-channel notification system for DHiBob that delivers alerts through three channels: **in-app** (real-time via SSE), **email** (via Resend), and **Slack** (via bot token). Users can configure per-type, per-channel preferences. A single `notifyService.send()` entry point handles fan-out across all channels, replacing the current ad-hoc notification logic scattered through individual routers.

## Current State & Motivation
Today, notification dispatch is fragmented:
- The `Notification` Prisma model stores in-app notifications (type, title, message, linkUrl, read status).
- `notification-dispatcher.ts` handles email (Resend) and Slack (bot DM) as a separate helper, with user preferences parsed from the `personalInfo` JSON blob on the Employee model.
- Each router (e.g., `timeoff.ts`) manually calls `ctx.db.notification.createMany()` plus `sendExternal()` inline, leading to duplicated fan-out logic.
- There is no real-time push -- the client polls via tRPC queries.
- Notification preferences are buried in `Employee.personalInfo` JSON with no UI for per-type control.

This plan consolidates everything into a single service with a proper preferences model, adds real-time delivery via SSE, and extends trigger coverage beyond time-off to documents, employee updates, and system-wide events.

## New Prisma Models

### NotificationPreference
Stores per-user, per-notification-type, per-channel toggles.

```prisma
model NotificationPreference {
  id          String   @id @default(cuid())
  employeeId  String
  eventType   String   // e.g. "TIMEOFF_REQUEST", "DOCUMENT_SIGNED", "EMPLOYEE_UPDATED", "SYSTEM"
  inApp       Boolean  @default(true)
  email       Boolean  @default(true)
  slack       Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  employee    Employee @relation("EmployeeNotificationPrefs", fields: [employeeId], references: [id], onDelete: Cascade)
  @@unique([employeeId, eventType])
  @@index([employeeId])
}
```

When no preference row exists for a given (employee, eventType), all channels default to **enabled** -- preferences are opt-out.

### Notification Model Changes
The existing `Notification` model is sufficient. Add one optional field:

```prisma
  channel     String?   // "IN_APP" | "EMAIL" | "SLACK" — logged for audit/debugging
```

No breaking changes to the existing schema.

### Employee Model Update
Add a relation to `NotificationPreference`:

```prisma
  notificationPrefs  NotificationPreference[] @relation("EmployeeNotificationPrefs")
```

## Notification Event Types

| Event Type | Trigger | Default Channels |
|---|---|---|
| `TIMEOFF_REQUEST` | Employee submits a time-off request | in-app, email, Slack |
| `TIMEOFF_APPROVED` | Time-off request approved | in-app, email, Slack |
| `TIMEOFF_REJECTED` | Time-off request rejected | in-app, email, Slack |
| `DOCUMENT_SIGNED` | DocuSign callback confirms signature complete | in-app, email |
| `DOCUMENT_PENDING_SIGNATURE` | Document sent for signature | in-app, email |
| `EMPLOYEE_UPDATED` | Profile field change (department, manager, status) | in-app |
| `TASK_ASSIGNED` | Onboarding/offboarding task assigned | in-app, email |
| `SURVEY_PUBLISHED` | New survey published | in-app, email |
| `HR_ANNOUNCEMENT` | HR portal announcement | in-app, email, Slack |
| `SYSTEM` | System-wide notices (maintenance, policy changes) | in-app |

## Architecture

### 1. Centralized `notifyService.send()`

A new module at `src/lib/notify-service.ts` replaces the current `notification-dispatcher.ts`. Single entry point:

```typescript
interface NotifyPayload {
  companyId: string;
  recipients: string[];           // employee IDs
  eventType: string;              // matches NotificationPreference.eventType
  title: string;
  message?: string;
  linkUrl?: string;               // relative path for in-app link
  emailSubject?: string;          // falls back to title
  emailBody?: string;             // falls back to message
}

async function send(payload: NotifyPayload): Promise<void> {
  // 1. Batch-fetch NotificationPreference for all recipients + eventType
  // 2. For recipients with no preference row, use defaults (all channels on)
  // 3. Fan out in parallel:
  //    a. IN_APP: bulk-create Notification rows + push via SSE
  //    b. EMAIL: send via Resend for opted-in recipients
  //    c. SLACK: send DM via bot for opted-in recipients
}
```

**Key design decisions:**
- Recipients are always employee IDs (not user IDs) -- consistent with the existing `Notification.employeeId` foreign key.
- The service is a pure function module (no class instance), matching the project's existing pattern (`notification-dispatcher.ts`, `storage.ts`).
- Graceful degradation: if Resend API key or Slack bot token is missing, those channels are silently skipped (existing behavior, preserved).
- Errors on individual channels do not block other channels.

### 2. Real-Time In-App Delivery via SSE

**SSE endpoint:** `src/app/api/notifications/sse/route.ts`

```
GET /api/notifications/sse
Authorization: Bearer <JWT from next-auth>
```

Returns a `text/event-stream` response. The server keeps the connection open and pushes events when new notifications arrive for the authenticated user.

**Server-side connection management:**

A singleton `SSEConnectionManager` (in `src/lib/sse-manager.ts`) maintains a `Map<employeeId, Set<ReadableStreamController>>`. When `notifyService.send()` creates in-app notifications, it calls `sseManager.push(employeeId, notification)` which writes to all active controllers for that employee.

```typescript
class SSEConnectionManager {
  private connections = new Map<string, Set<ReadableStreamDefaultController>>();

  register(employeeId: string, controller: ReadableStreamDefaultController): void;
  unregister(employeeId: string, controller: ReadableStreamDefaultController): void;
  push(employeeId: string, data: object): void;
}
```

**Client-side integration:**

A React hook `useNotificationSSE()` in `src/lib/hooks/use-notification-sse.ts`:
- Opens an `EventSource` to `/api/notifications/sse`
- On message receipt, invalidates the tRPC `notifications.list` and `notifications.unreadCount` queries
- Handles reconnection with exponential backoff
- Cleans up on unmount

The existing `NotificationsPopover` component gains real-time updates by adding this hook -- no structural changes to the component itself.

**Scaling note:** The in-memory `SSEConnectionManager` works for a single-process deployment (current setup: one `app` container). For multi-instance scaling, a future upgrade would use Redis Pub/Sub to broadcast across instances. The `SSEConnectionManager` is designed with a clean interface so this swap is straightforward.

### 3. Email Channel (Resend)

Preserves the existing Resend integration from `notification-dispatcher.ts`. Changes:
- Email sending logic moves into `notify-service.ts` (or is imported from a focused `src/lib/channels/email.ts` module).
- HTML template is reused and parameterized.
- Recipient lookup (employee -> email + name) is done in bulk by `notifyService.send()` before dispatching.
- Preferences are checked per-recipient: only send email if `NotificationPreference.email` is true (or no preference row exists).

### 4. Slack Channel (Bot Token)

Preserves the existing `@slack/web-api` integration. Changes:
- Slack DM logic moves into `notify-service.ts` (or `src/lib/channels/slack.ts`).
- Messages appear **from the bot** (already the case -- `chat.postMessage` with the bot token posts as the bot user).
- `users.lookupByEmail` is used to resolve Slack user IDs (existing pattern).
- Preferences are checked per-recipient.

## File Structure

```
src/lib/
  notify-service.ts          # Central send() + preference resolution
  sse-manager.ts             # SSE connection manager singleton
  channels/
    email.ts                 # Resend email sending (extracted from notification-dispatcher.ts)
    slack.ts                 # Slack DM sending (extracted from notification-dispatcher.ts)
  hooks/
    use-notification-sse.ts  # React hook for SSE client
src/app/api/
  notifications/
    sse/route.ts             # SSE endpoint (GET, streaming)
src/server/routers/
  notifications.ts           # Add preference CRUD procedures
  notification-preferences.ts # (alternative: dedicated router for preferences)
src/components/
  settings/
    notification-preferences.tsx  # UI for per-type, per-channel toggles
```

## Notification Preferences UI

A new section in the employee settings/profile page with a table/grid:

| Notification Type | In-App | Email | Slack |
|---|---|---|---|
| Time-off requests | [x] | [x] | [x] |
| Document signing | [x] | [x] | [ ] |
| Employee updates | [x] | [ ] | [ ] |
| Task assignments | [x] | [x] | [ ] |
| Surveys | [x] | [x] | [ ] |
| HR announcements | [x] | [x] | [x] |
| System notices | [x] | [ ] | [ ] |

Each toggle calls `notificationPreferences.upsert` to create or update the preference row.

## tRPC Router Extensions

### notifications router additions

```typescript
// Get preferences for current user
getPreferences: protectedProcedure.query(...)

// Upsert a single preference
upsertPreference: protectedProcedure
  .input(z.object({
    eventType: z.string(),
    inApp: z.boolean(),
    email: z.boolean(),
    slack: z.boolean(),
  }))
  .mutation(...)

// Reset all preferences to defaults (delete all rows)
resetPreferences: protectedProcedure.mutation(...)
```

## Migration Path

### Phase 1: Foundation (non-breaking)
1. Add `NotificationPreference` model to Prisma schema and run migration.
2. Add optional `channel` field to `Notification` model.
3. Create `notify-service.ts` with `send()` that wraps existing DB insert + Resend + Slack logic.
4. Add preference CRUD to the notifications tRPC router.

### Phase 2: SSE Real-Time
5. Implement `SSEConnectionManager` and the `/api/notifications/sse` endpoint.
6. Create `useNotificationSSE()` hook.
7. Wire the hook into the existing `NotificationsPopover` component.

### Phase 3: Caller Migration
8. Replace inline `ctx.db.notification.createMany()` + `sendExternal()` calls in `timeoff.ts` with `notifyService.send()`.
9. Add `notifyService.send()` calls to document signing flow (DocuSign callback).
10. Add `notifyService.send()` calls to employee update mutations.
11. Add `notifyService.send()` calls to any remaining trigger points (task assignment, survey publish, etc.).

### Phase 4: Preferences UI
12. Build the notification preferences grid component.
13. Add it to the employee profile/settings page.
14. Remove legacy preference parsing from `Employee.personalInfo` JSON.

### Phase 5: Cleanup
15. Delete `src/lib/notification-dispatcher.ts` (fully replaced).
16. Update seed data to include default notification preferences if desired.

## Environment Variables

Existing (no changes):
- `RESEND_API_KEY` -- Resend API key for email delivery
- `NOTIFICATION_FROM_EMAIL` -- sender address for emails
- `SLACK_BOT_TOKEN` -- Slack bot token for DMs

No new environment variables required.

## Security Considerations
- **SSE authentication:** The SSE endpoint validates the JWT from the `next-auth` session cookie before establishing the stream. Unauthenticated requests receive 401.
- **Multi-tenant isolation:** All queries filter by `companyId`. The `notifyService.send()` function receives `companyId` explicitly and passes it through to DB writes.
- **Preference access control:** Users can only read/write their own notification preferences (enforced by `ctx.user.employeeId` scoping in the tRPC router).
- **Rate limiting:** SSE connections per user are capped (e.g., max 3 concurrent tabs). Excess connections receive a `429` or the oldest is evicted.

## Testing Strategy
- **Unit tests:** `notifyService.send()` with mocked DB, Resend, and Slack -- verify fan-out respects preferences, verify graceful degradation when channels are unconfigured.
- **SSE tests:** Verify connection lifecycle (open, push, close), authentication rejection, and multi-tab behavior.
- **Integration tests:** End-to-end flow: trigger event -> notification created in DB -> SSE push received by client -> email sent via Resend mock.
- **Preference tests:** CRUD operations, default behavior when no preferences exist, cascading delete when employee is removed.
