# Google Calendar Sync for Time-Off -- Implementation Plan

One-way sync: when a time-off request reaches APPROVED status in Dpeople,
create an all-day event on a shared (or personal) Google Calendar.

---

## 0. Install dependency

```bash
npm install googleapis
```

The `googleapis` package (~v137+) bundles full TypeScript types for the
Calendar v3 API. No additional `@types/` package is needed.

---

## 1. Environment variables

### 1a. New env vars

| Variable | Purpose | Example |
|---|---|---|
| `GOOGLE_CALENDAR_ID` | Target calendar. Use `primary` for dev (user's own calendar). In prod, set to the shared calendar ID. | `primary` or `abc123@group.calendar.google.com` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Base64-encoded JSON key of the Google service account. The channel reads this, decodes it, and passes it to `google.auth.GoogleAuth`. | `eyJ0eX...` (base64 of the JSON key file) |

When both variables are **missing**, the channel is disabled and all
calls silently return (same pattern as email/slack channels).

### 1b. Files to update

**`.env.example`** -- append after the `SLACK_BOT_TOKEN=` line (line 21):

```
# Google Calendar sync (optional -- creates all-day events when time-off is approved)
# Service account JSON key, base64-encoded: cat key.json | base64 -w0
GOOGLE_SERVICE_ACCOUNT_KEY=
# Calendar ID: use "primary" for dev, or a shared calendar ID for prod
GOOGLE_CALENDAR_ID=primary
```

**`scripts/pull-secrets.sh`** -- after line 25 (`ENCRYPTION_KEY=...`), add:

```bash
GCAL_SA_KEY=$(echo "$SECRETS_JSON" | jq -r '.GOOGLE_SERVICE_ACCOUNT_KEY // empty')
GCAL_CALENDAR_ID=$(echo "$SECRETS_JSON" | jq -r '.GOOGLE_CALENDAR_ID // empty')
```

And inside the heredoc (after `FIELD_ENCRYPTION_KEY=$ENCRYPTION_KEY` on line 53), add:

```
GOOGLE_SERVICE_ACCOUNT_KEY=$GCAL_SA_KEY
GOOGLE_CALENDAR_ID=$GCAL_CALENDAR_ID
```

---

## 2. Prisma schema change

Add an optional field to track the created calendar event so we can
delete/update it later if needed (e.g., when a request is cancelled).

**File:** `prisma/schema.prisma`, inside `model TimeOffRequest` (line 195-229).

Add this field after `groupLeaderApprovedAt` (after line 218, before the
`createdAt` line 220):

```prisma
  googleCalendarEventId String?
```

After editing, run `npx prisma db push` (dev) or generate a migration.

---

## 3. Create `src/lib/channels/google-calendar.ts`

Follow the exact pattern of `email.ts` and `slack.ts`:
- Read env vars at module scope
- Instantiate client conditionally (null when not configured)
- Export `isGoogleCalendarConfigured(): boolean`
- Export `createTimeOffEvent(...)` and `deleteTimeOffEvent(...)`
- Wrap all API calls in try/catch, log errors with `[notify:gcal]` prefix
- Never throw -- graceful degradation

### Detailed implementation

```ts
/**
 * Google Calendar channel: creates all-day events for approved time-off.
 * Follows the same env-guard + graceful-degradation pattern as email.ts / slack.ts.
 */
import { google, calendar_v3 } from 'googleapis';

const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const calendarId = process.env.GOOGLE_CALENDAR_ID;

// Build auth client from base64-encoded service account JSON
let calendar: calendar_v3.Calendar | null = null;
if (serviceAccountKey && calendarId) {
  try {
    const decoded = JSON.parse(
      Buffer.from(serviceAccountKey, 'base64').toString('utf-8'),
    );
    const auth = new google.auth.GoogleAuth({
      credentials: decoded,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    calendar = google.calendar({ version: 'v3', auth });
  } catch (err) {
    console.error('[notify:gcal] failed to initialise:', (err as Error)?.message ?? err);
  }
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(calendar && calendarId);
}

export interface TimeOffEventInput {
  employeeName: string;   // "Alice Tester"
  policyName: string;     // "Vacation"
  startDate: Date;        // inclusive start
  endDate: Date;          // inclusive end
  reason?: string | null;
  requestId: string;      // for idempotency / description
}

/**
 * Create an all-day event on the configured Google Calendar.
 * Returns the created event ID (for storage), or null on failure.
 */
export async function createTimeOffEvent(input: TimeOffEventInput): Promise<string | null> {
  if (!calendar || !calendarId) return null;
  try {
    // Google Calendar all-day events use date (not dateTime).
    // The end date is EXCLUSIVE in Google's API, so add one day.
    const endExclusive = new Date(input.endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `${input.employeeName} -- ${input.policyName}`,
        description: [
          `Time-off request ${input.requestId}`,
          input.reason ? `Reason: ${input.reason}` : '',
        ].filter(Boolean).join('\n'),
        start: { date: fmtDate(input.startDate) },
        end: { date: fmtDate(endExclusive) },
        transparency: 'opaque',
      },
    });
    return res.data.id ?? null;
  } catch (err) {
    console.error('[notify:gcal] createTimeOffEvent failed:', (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * Delete a previously-created event (e.g. when request is cancelled).
 */
export async function deleteTimeOffEvent(eventId: string): Promise<void> {
  if (!calendar || !calendarId) return;
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch (err) {
    console.error('[notify:gcal] deleteTimeOffEvent failed:', (err as Error)?.message ?? err);
  }
}

/** Format a Date as YYYY-MM-DD for Google Calendar all-day events. */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

---

## 4. Wire into the time-off approval flow

**File:** `src/server/routers/timeoff.ts`

### 4a. Add import (after line 6)

```ts
import { createTimeOffEvent } from '@/lib/channels/google-calendar';
```

### 4b. Trigger on full approval in `approve` mutation (after line 414)

Inside the `if (allResolved)` block (line 405), after the
`notifyService.send(...)` call to the requester (closing `});` on line 414)
and before the "Inform every approver" block (line 415), add:

```ts
      // Sync approved time-off to Google Calendar
      const gcalEventId = await createTimeOffEvent({
        employeeName: `${request.employee.firstName} ${request.employee.lastName}`,
        policyName: request.policy.name,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason,
        requestId: request.id,
      });
      if (gcalEventId) {
        await ctx.db.timeOffRequest.update({
          where: { id: input.requestId },
          data: { googleCalendarEventId: gcalEventId },
        });
      }
```

### 4c. Trigger on auto-approve in `submitRequest` (after line 306)

Inside the `if (!hasHr && !teamLeaderId && !groupLeaderId)` block
(line 302), after the `ctx.db.timeOffRequest.update(...)` call (closing
`});` on line 306), add the same Google Calendar sync:

```ts
      // Sync auto-approved time-off to Google Calendar
      const gcalEventId = await createTimeOffEvent({
        employeeName: `${employee.firstName} ${employee.lastName}`,
        policyName: policy.name,
        startDate,
        endDate,
        reason,
        requestId: request.id,
      });
      if (gcalEventId) {
        await ctx.db.timeOffRequest.update({
          where: { id: request.id },
          data: { googleCalendarEventId: gcalEventId },
        });
      }
```

### 4d. (Optional) Delete event on cancel in `cancelRequest` (after line 780)

In the `cancelRequest` mutation, before the `ctx.db.timeOffRequest.delete`
call (line 781), add:

```ts
      // Remove Google Calendar event if one was created
      if (request.googleCalendarEventId) {
        const { deleteTimeOffEvent } = await import('@/lib/channels/google-calendar');
        await deleteTimeOffEvent(request.googleCalendarEventId);
      }
```

Note: the `cancelRequest` already does `include: { employee: true }` on
line 771-773, but it does NOT currently select `googleCalendarEventId`.
Since it uses `findUnique` without a `select` clause, it returns all
scalar fields by default, so `googleCalendarEventId` will be available
automatically after the schema change.

---

## 5. Test files

### 5a. `tests/unit/lib/google-calendar-channel.test.ts` (60% weight)

Mock the `googleapis` module. Verify:

1. **`isGoogleCalendarConfigured()` returns true** when both env vars are set
2. **`isGoogleCalendarConfigured()` returns false** when env vars are missing
3. **`createTimeOffEvent` calls `calendar.events.insert`** with correct params:
   - summary format: `"Alice Tester -- Vacation"`
   - start.date = `"2024-06-10"`, end.date = `"2024-06-15"` (exclusive)
   - description includes requestId
4. **`createTimeOffEvent` returns the event ID** from the API response
5. **`createTimeOffEvent` returns null and logs error** when API throws
6. **`deleteTimeOffEvent` calls `calendar.events.delete`** with correct eventId
7. **`deleteTimeOffEvent` gracefully handles errors** (no throw)

Mock pattern (matching email-channel.test.ts and slack-channel.test.ts style):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ data: { id: 'evt-123' } });
const mockDelete = vi.fn().mockResolvedValue({});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        insert: (...args: any[]) => mockInsert(...args),
        delete: (...args: any[]) => mockDelete(...args),
      },
    }),
  },
}));

process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(
  JSON.stringify({ type: 'service_account', project_id: 'test' }),
).toString('base64');
process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';
```

### 5b. `tests/unit/lib/google-calendar-approval-flow.test.ts` (30% weight)

Test that the timeoff router's `approve` mutation triggers Google Calendar
sync when `allResolved` is true, and does NOT trigger it when only a
partial approval happens.

This test:
- Mocks `@/lib/channels/google-calendar` with a spy on `createTimeOffEvent`
- Uses the same router test pattern from `timeoff.router.test.ts` (mock db, createCaller)
- Scenario A: all slots SKIPPED except HR PENDING, HR approves -> allResolved=true -> `createTimeOffEvent` called once
- Scenario B: HR PENDING + teamLeader PENDING, HR approves -> allResolved=false -> `createTimeOffEvent` NOT called

Mock addition (add to existing mocks pattern):
```ts
const mockCreateTimeOffEvent = vi.fn().mockResolvedValue('evt-456');
vi.mock('@/lib/channels/google-calendar', () => ({
  createTimeOffEvent: (...args: any[]) => mockCreateTimeOffEvent(...args),
}));
```

### 5c. `tests/unit/lib/google-calendar-config.test.ts` (10% weight)

Verify schema and configuration:
- The `googleCalendarEventId` field exists in the Prisma schema (string check on schema file content)
- The `.env.example` contains `GOOGLE_SERVICE_ACCOUNT_KEY` and `GOOGLE_CALENDAR_ID`
- The `pull-secrets.sh` contains the new env vars

---

## 6. Summary of all files to create or modify

### New files (create)
| File | Purpose |
|---|---|
| `src/lib/channels/google-calendar.ts` | Channel module |
| `tests/unit/lib/google-calendar-channel.test.ts` | Channel unit tests |
| `tests/unit/lib/google-calendar-approval-flow.test.ts` | Approval flow integration tests |
| `tests/unit/lib/google-calendar-config.test.ts` | Config/schema validation tests |

### Modified files (edit)
| File | Change |
|---|---|
| `package.json` | Add `googleapis` dependency |
| `prisma/schema.prisma` | Add `googleCalendarEventId String?` to TimeOffRequest (after line 218) |
| `src/server/routers/timeoff.ts` | Import channel + call on approval (lines 6, 306, 414) |
| `.env.example` | Add `GOOGLE_SERVICE_ACCOUNT_KEY` and `GOOGLE_CALENDAR_ID` (after line 21) |
| `scripts/pull-secrets.sh` | Pull new secrets from AWS Secrets Manager (after line 25 and line 53) |

---

## 7. Execution order

1. `npm install googleapis`
2. Edit `prisma/schema.prisma` -- add `googleCalendarEventId`
3. Create `src/lib/channels/google-calendar.ts`
4. Edit `src/server/routers/timeoff.ts` -- add import + sync calls
5. Edit `.env.example` -- add new vars
6. Edit `scripts/pull-secrets.sh` -- add new secret extraction
7. Create test files (all three)
8. Run `npx vitest run` to verify all tests pass
9. Run `npx prisma db push` if local DB is available

---

## 8. Google Calendar event format

| Field | Value |
|---|---|
| Summary | `{firstName} {lastName} -- {policyName}` e.g. "Alice Tester -- Vacation" |
| Description | `Time-off request {requestId}\nReason: {reason}` |
| Start | All-day, inclusive: `2024-06-10` |
| End | All-day, exclusive (Google API convention): `2024-06-15` for a request ending 2024-06-14 |
| Transparency | `opaque` (shows as busy) |

---

## 9. Auth approach: Service Account

Using a **Google service account** (not OAuth user tokens) because:
- Server-to-server, no user interaction needed
- The service account must be granted write access to the shared calendar
- For dev/testing with `primary`, the service account's own calendar is used
- No token refresh management needed -- `googleapis` handles it
- Credentials stored as base64-encoded JSON in a single env var for simplicity

Alternative considered: using the existing next-auth Google OAuth tokens.
Rejected because those are user-scoped tokens that expire and require the
user to be logged in; the calendar sync runs server-side on approval.
