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
