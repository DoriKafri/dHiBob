# Test Plan: Google Calendar Sync for Time-Off

Concrete test specifications for the implementation subagent. Every test
case is listed with its name, mocks, assertions, and env-var requirements.

---

## File 1: `tests/unit/lib/google-calendar-channel.test.ts`

**Weight:** 60% of testing effort
**Purpose:** Verify the channel module (`src/lib/channels/google-calendar.ts`) in isolation.

### Mocking strategy

Set up mocks **before** any imports, matching the pattern used in
`slack-channel.test.ts` and `email-channel.test.ts`.

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
```

**Env vars (set before import):**

```ts
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(
  JSON.stringify({ type: 'service_account', project_id: 'test' }),
).toString('base64');
process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';
```

**Shared test input:**

```ts
const sampleInput = {
  employeeName: 'Alice Tester',
  policyName: 'Vacation',
  startDate: new Date('2024-06-10'),
  endDate: new Date('2024-06-14'),
  reason: 'Summer trip',
  requestId: 'req-1',
};
```

### Test cases

#### `describe('google-calendar channel')`

Each test should `await import('@/lib/channels/google-calendar')` inside the
test body (same dynamic-import pattern as the slack/email tests). Call
`vi.clearAllMocks()` in `beforeEach`.

---

**1. `it('isGoogleCalendarConfigured returns true when both env vars are set')`**

- Import `isGoogleCalendarConfigured`.
- Assert: `expect(isGoogleCalendarConfigured()).toBe(true)`.

---

**2. `it('createTimeOffEvent calls calendar.events.insert with correct params')`**

- Import `createTimeOffEvent`.
- Call `await createTimeOffEvent(sampleInput)`.
- Assert `mockInsert` was called once.
- Extract the call args: `const args = mockInsert.mock.calls[0][0]`.
- Assert:
  - `args.calendarId` === `'test-calendar-id'`
  - `args.requestBody.summary` === `'Alice Tester -- Vacation'`
  - `args.requestBody.start.date` === `'2024-06-10'`
  - `args.requestBody.end.date` === `'2024-06-15'` (exclusive end = endDate + 1 day)
  - `args.requestBody.description` contains `'req-1'`
  - `args.requestBody.description` contains `'Summer trip'`
  - `args.requestBody.transparency` === `'opaque'`

---

**3. `it('createTimeOffEvent returns the event ID from the API response')`**

- `mockInsert.mockResolvedValueOnce({ data: { id: 'evt-xyz' } })`.
- Call `const result = await createTimeOffEvent(sampleInput)`.
- Assert: `expect(result).toBe('evt-xyz')`.

---

**4. `it('createTimeOffEvent returns null when API throws')`**

- `mockInsert.mockRejectedValueOnce(new Error('API quota exceeded'))`.
- Spy on `console.error`: `const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})`.
- Call `const result = await createTimeOffEvent(sampleInput)`.
- Assert: `expect(result).toBeNull()`.
- Assert: `expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[notify:gcal]'), expect.anything())`.
- Restore: `consoleSpy.mockRestore()`.

---

**5. `it('createTimeOffEvent omits reason line from description when reason is null')`**

- Call with `{ ...sampleInput, reason: null }`.
- Assert: the `requestBody.description` does NOT contain `'Reason:'`.
- Assert: the `requestBody.description` contains `'req-1'`.

---

**6. `it('createTimeOffEvent returns null when channel is not configured')`**

This test needs the channel to be unconfigured. Since the module reads env
vars at import time and vitest caches modules, use a **separate describe
block** with `vi.resetModules()`:

```ts
describe('when not configured', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_CALENDAR_ID;
  });

  afterEach(() => {
    // Restore for other tests
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(
      JSON.stringify({ type: 'service_account', project_id: 'test' }),
    ).toString('base64');
    process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';
  });

  it('isGoogleCalendarConfigured returns false when env vars are missing', async () => {
    const { isGoogleCalendarConfigured } = await import('@/lib/channels/google-calendar');
    expect(isGoogleCalendarConfigured()).toBe(false);
  });

  it('createTimeOffEvent returns null silently when not configured', async () => {
    const { createTimeOffEvent } = await import('@/lib/channels/google-calendar');
    const result = await createTimeOffEvent(sampleInput);
    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

---

**7. `it('deleteTimeOffEvent calls calendar.events.delete with correct params')`**

- Import `deleteTimeOffEvent`.
- Call `await deleteTimeOffEvent('evt-123')`.
- Assert `mockDelete` was called once.
- Extract args: `const args = mockDelete.mock.calls[0][0]`.
- Assert:
  - `args.calendarId` === `'test-calendar-id'`
  - `args.eventId` === `'evt-123'`

---

**8. `it('deleteTimeOffEvent does not throw when API fails')`**

- `mockDelete.mockRejectedValueOnce(new Error('Not found'))`.
- Spy on `console.error`: `const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})`.
- Assert: `await expect(deleteTimeOffEvent('evt-999')).resolves.toBeUndefined()`.
- Assert: `consoleSpy` was called with a string containing `'[notify:gcal]'`.
- Restore: `consoleSpy.mockRestore()`.

---

### Summary of assertions for File 1

| # | Test name | Key assertion |
|---|-----------|---------------|
| 1 | configured returns true | `isGoogleCalendarConfigured() === true` |
| 2 | insert called with correct params | summary, dates, description, transparency |
| 3 | returns event ID | `result === 'evt-xyz'` |
| 4 | returns null on API error | `result === null`, console.error logged |
| 5 | omits reason when null | description has no `Reason:` |
| 6a | configured returns false (no env) | `isGoogleCalendarConfigured() === false` |
| 6b | returns null silently (no env) | `result === null`, `mockInsert` not called |
| 7 | delete called with correct params | calendarId, eventId |
| 8 | delete does not throw | resolves to undefined, error logged |

---

## File 2: `tests/unit/lib/google-calendar-approval-flow.test.ts`

**Weight:** 30% of testing effort
**Purpose:** Verify the timeoff router's `approve` mutation triggers (or
does not trigger) Google Calendar sync based on `allResolved` status.

### Mocking strategy

Follow the exact pattern from `timeoff.router.test.ts`. Copy its db mock,
`makeCtx`, `vi.mock('@/server/trpc', ...)`, and `vi.mock('@/lib/notify-service', ...)`.

Additionally, mock the Google Calendar channel:

```ts
const mockCreateTimeOffEvent = vi.fn().mockResolvedValue('evt-456');
vi.mock('@/lib/channels/google-calendar', () => ({
  createTimeOffEvent: (...args: any[]) => mockCreateTimeOffEvent(...args),
}));
```

Use the same `db` mock object as in `timeoff.router.test.ts`, with `vi.mock('@/lib/db', ...)`.

### Shared test data

```ts
const mockEmployee = { id: 'emp-1', firstName: 'Alice', lastName: 'Tester', companyId: 'co-1' };
const mockPolicy = { id: 'pol-1', companyId: 'co-1', name: 'Vacation', type: 'VACATION' };
const baseRequest = {
  id: 'req-1',
  employeeId: 'emp-1',
  policyId: 'pol-1',
  startDate: new Date('2024-06-10'),
  endDate: new Date('2024-06-14'),
  days: 5,
  status: 'PENDING',
  reason: 'Summer trip',
  employee: mockEmployee,
  policy: mockPolicy,
  googleCalendarEventId: null,
};
```

### Test cases

#### `describe('approve -> Google Calendar sync')`

---

**1. `it('calls createTimeOffEvent when all approval slots are resolved (allResolved=true)')`**

Setup:
- `db.timeOffRequest.findUnique` returns a request with:
  - `hrStatus: 'PENDING'`
  - `teamLeaderStatus: 'SKIPPED'`, `teamLeaderId: null`
  - `groupLeaderStatus: 'SKIPPED'`, `groupLeaderId: null`
- `db.timeOffRequest.update` returns the request with `status: 'APPROVED'`.
- `db.user.findMany` returns `[]` (no additional HR approvers).
- Context: `makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' })`.

Action:
- `await createCaller(ctx).approve({ requestId: 'req-1' })`.

Assertions:
- `expect(mockCreateTimeOffEvent).toHaveBeenCalledTimes(1)`.
- Extract the call arg: `const arg = mockCreateTimeOffEvent.mock.calls[0][0]`.
- `expect(arg.employeeName).toBe('Alice Tester')`.
- `expect(arg.policyName).toBe('Vacation')`.
- `expect(arg.startDate).toEqual(new Date('2024-06-10'))`.
- `expect(arg.endDate).toEqual(new Date('2024-06-14'))`.
- `expect(arg.requestId).toBe('req-1')`.
- `expect(arg.reason).toBe('Summer trip')`.

---

**2. `it('does NOT call createTimeOffEvent when only a partial approval happens (allResolved=false)')`**

Setup:
- `db.timeOffRequest.findUnique` returns a request with:
  - `hrStatus: 'PENDING'`
  - `teamLeaderId: 'mgr-1'`, `teamLeaderStatus: 'PENDING'`
  - `groupLeaderStatus: 'SKIPPED'`, `groupLeaderId: null`
- `db.timeOffRequest.update` returns the request with `status: 'PENDING'`, `hrStatus: 'APPROVED'`.
- Context: `makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' })`.

Action:
- `await createCaller(ctx).approve({ requestId: 'req-1' })`.

Assertions:
- `expect(mockCreateTimeOffEvent).not.toHaveBeenCalled()`.

---

**3. `it('stores the returned event ID in the database via timeOffRequest.update')`**

Setup:
- Same as test 1 (allResolved=true).
- `mockCreateTimeOffEvent.mockResolvedValueOnce('evt-789')`.

Action:
- `await createCaller(ctx).approve({ requestId: 'req-1' })`.

Assertions:
- `db.timeOffRequest.update` should have been called at least twice:
  once for the approval status update, and once to store the event ID.
- Find the update call whose `data` includes `googleCalendarEventId`:
  ```ts
  const gcalUpdateCall = db.timeOffRequest.update.mock.calls.find(
    (call: any) => call[0]?.data?.googleCalendarEventId
  );
  expect(gcalUpdateCall).toBeDefined();
  expect(gcalUpdateCall[0].data.googleCalendarEventId).toBe('evt-789');
  ```

---

**4. `it('does NOT update the database when createTimeOffEvent returns null')`**

Setup:
- Same as test 1 (allResolved=true).
- `mockCreateTimeOffEvent.mockResolvedValueOnce(null)`.

Action:
- `await createCaller(ctx).approve({ requestId: 'req-1' })`.

Assertions:
- `db.timeOffRequest.update` should have been called exactly once
  (the approval update only, not a second call for the event ID).
  ```ts
  expect(db.timeOffRequest.update).toHaveBeenCalledTimes(1);
  ```

---

### Summary of assertions for File 2

| # | Test name | Key assertion |
|---|-----------|---------------|
| 1 | calls createTimeOffEvent on full approval | called once with correct args |
| 2 | does NOT call on partial approval | not called |
| 3 | stores event ID in DB | second update call with googleCalendarEventId |
| 4 | skips DB update when event ID is null | update called only once |

---

## File 3: `tests/unit/lib/google-calendar-config.test.ts`

**Weight:** 10% of testing effort
**Purpose:** Verify schema and configuration files contain the expected
additions for Google Calendar support.

### Mocking strategy

No SDK mocks needed. These tests read files from disk using `fs.readFileSync`.

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
```

### Test cases

#### `describe('Google Calendar configuration')`

---

**1. `it('prisma schema includes googleCalendarEventId on TimeOffRequest')`**

```ts
const schema = fs.readFileSync(
  path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf-8'
);
expect(schema).toContain('googleCalendarEventId');
// Verify it's optional String
expect(schema).toMatch(/googleCalendarEventId\s+String\?/);
```

---

**2. `it('.env.example contains GOOGLE_SERVICE_ACCOUNT_KEY')`**

```ts
const envExample = fs.readFileSync(
  path.resolve(__dirname, '../../../.env.example'), 'utf-8'
);
expect(envExample).toContain('GOOGLE_SERVICE_ACCOUNT_KEY');
```

---

**3. `it('.env.example contains GOOGLE_CALENDAR_ID')`**

```ts
expect(envExample).toContain('GOOGLE_CALENDAR_ID');
```

---

**4. `it('pull-secrets.sh extracts GOOGLE_SERVICE_ACCOUNT_KEY from secrets')`**

```ts
const pullSecrets = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/pull-secrets.sh'), 'utf-8'
);
expect(pullSecrets).toContain('GOOGLE_SERVICE_ACCOUNT_KEY');
```

---

**5. `it('pull-secrets.sh extracts GOOGLE_CALENDAR_ID from secrets')`**

```ts
expect(pullSecrets).toContain('GOOGLE_CALENDAR_ID');
```

---

### Summary of assertions for File 3

| # | Test name | Key assertion |
|---|-----------|---------------|
| 1 | prisma schema has field | `googleCalendarEventId String?` in schema |
| 2 | .env.example has SA key | `GOOGLE_SERVICE_ACCOUNT_KEY` present |
| 3 | .env.example has calendar ID | `GOOGLE_CALENDAR_ID` present |
| 4 | pull-secrets has SA key | `GOOGLE_SERVICE_ACCOUNT_KEY` in script |
| 5 | pull-secrets has calendar ID | `GOOGLE_CALENDAR_ID` in script |

---

## Env var reference

| Env var | File 1 (channel) | File 2 (approval) | File 3 (config) |
|---------|:-:|:-:|:-:|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Set (base64-encoded JSON) for configured tests; delete for unconfigured tests | Not needed (channel is mocked) | Not needed (reads files) |
| `GOOGLE_CALENDAR_ID` | Set to `'test-calendar-id'` for configured tests; delete for unconfigured tests | Not needed (channel is mocked) | Not needed (reads files) |
| `SLACK_BOT_TOKEN` | Not needed | Not needed | Not needed |
| `RESEND_API_KEY` | Not needed | Not needed | Not needed |

---

## Execution checklist

1. Create all three test files.
2. Run `npx vitest run tests/unit/lib/google-calendar-channel.test.ts`.
3. Run `npx vitest run tests/unit/lib/google-calendar-approval-flow.test.ts`.
4. Run `npx vitest run tests/unit/lib/google-calendar-config.test.ts`.
5. Run `npx vitest run` to verify no regressions in existing tests.

All tests must use mocks only -- zero real Google API calls in CI.
