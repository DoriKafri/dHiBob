# Test Plan: Wire Time Off Module

**Date:** 2026-04-02
**Branch:** wire-timeoff-module
**Related plan:** `docs/plans/2026-04-02-wire-timeoff-module.md`

---

## Scope

This test plan covers the full quality bar for wiring the Time Off module:

1. Fix 4 `timeoffRouter` schema bugs (pre-condition)
2. Fix 2 infrastructure bugs (`providers.tsx`, `auth.ts`)
3. Router integration tests via `createCaller` with mocked Prisma
4. Component tests for all new UI
5. Regression: existing service tests and `employee.router.test.ts` stay green

---

## Test Files to Create

| # | File | Tests | Purpose |
|---|---|---|---|
| 1 | `tests/unit/auth/timeoff-auth-session.test.ts` | 2 | Auth callback propagates `companyId`/`employeeId` |
| 2 | `tests/unit/providers/timeoff-trpc-provider.test.tsx` | 1 | `trpc.Provider` is rendered in the tree |
| 3 | `tests/unit/routers/timeoff.router.test.ts` | 9 | Router procedures via `createCaller` + mocked Prisma |
| 4 | `tests/unit/components/request-form-modal.test.tsx` | 3 | Form validation + mutation wiring |
| 5 | `tests/unit/components/approval-queue.test.tsx` | 3 | Approve/Reject mutation calls |
| 6 | `tests/unit/components/calendar-view.test.tsx` | 3 | Day-of-week grid + month navigation |
| 7 | `tests/unit/components/time-off-page.test.tsx` | 5 | Balance cards, request list, tabs, modal trigger |

**Total new tests: 26**

---

## Regression Files (must stay green)

| File | Test count |
|---|---|
| `tests/unit/services/employee.test.ts` | existing |
| `tests/unit/services/analytics.test.ts` | existing |
| `tests/unit/services/hiring.test.ts` | existing |

---

## Test 1 — Auth callbacks (`timeoff-auth-session.test.ts`)

**Path:** `tests/unit/auth/timeoff-auth-session.test.ts`

**Why:** Every tRPC router uses `ctx.user.companyId`. Without the JWT/session fix, company isolation is completely broken and all router queries return wrong data or throw FORBIDDEN.

**Harness:** Pure Vitest unit — inline callback logic, no imports from `auth.ts`. No mocks needed.

### Cases

| # | Name | Input | Expected |
|---|---|---|---|
| 1 | `jwt callback copies companyId and employeeId from user to token` | user `{ companyId: 'co-1', employeeId: 'emp-1', role: 'ADMIN' }` | token has `companyId = 'co-1'`, `employeeId = 'emp-1'`, `role = 'ADMIN'` |
| 2 | `session callback reads companyId and employeeId from token` | token `{ sub: 'user-1', companyId: 'co-1', employeeId: 'emp-1', role: 'ADMIN' }` | `session.user.companyId = 'co-1'`, `session.user.employeeId = 'emp-1'` |

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/auth/timeoff-auth-session.test.ts
```

**Pass bar:** 2 PASS

---

## Test 2 — Providers (`timeoff-trpc-provider.test.tsx`)

**Path:** `tests/unit/providers/timeoff-trpc-provider.test.tsx`

**Why:** Without `trpc.Provider`, every `trpc.timeoff.*.useQuery` hook throws "No tRPC Client found in React tree" at runtime. This is the second infrastructure pre-condition before any UI test can use real tRPC hooks.

**Harness:** Vitest + Testing Library + jsdom. `@/lib/trpc` mocked to return a `Provider` with a `data-testid="trpc-provider"` sentinel. `@trpc/client` mocked.

### Cases

| # | Name | What it asserts |
|---|---|---|
| 1 | `renders trpc.Provider around children` | `data-testid="trpc-provider"` exists in DOM; child `data-testid="child"` is also present |

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/providers/timeoff-trpc-provider.test.tsx
```

**Pass bar:** 1 PASS

---

## Test 3 — Router integration (`timeoff.router.test.ts`)

**Path:** `tests/unit/routers/timeoff.router.test.ts`

**Why:** Directly verifies that the 4 schema bugs are fixed and `listPolicies` works. Uses `createCaller` with an in-memory Prisma mock — no live DB needed, tests are fast and deterministic.

**Harness:** Vitest. `@/lib/db` mocked (`prisma` = mock object). `@/server/trpc` mocked (minimal `initTRPC` that injects the mock DB via context). `timeoffRouter` imported and called via `createCaller`.

**Mock data:**
- `mockCompany = { id: 'co-1' }`
- `mockEmployee = { id: 'emp-1', firstName: 'Alice', lastName: 'Tester', companyId: 'co-1' }`
- `mockPolicy = { id: 'pol-1', companyId: 'co-1', name: 'Vacation', type: 'VACATION', ... }`
- `mockRequest` — full `TimeOffRequest` row with `employee` and `policy` relations

### Cases

| # | Suite | Name | Mock setup | Expected |
|---|---|---|---|---|
| 1 | `listPolicies` | returns policies for the current company | `timeOffPolicy.findMany` → `[mockPolicy]` | result length 1, `result[0].name = 'Vacation'`; `findMany` called with `where: { companyId: 'co-1' }` |
| 2 | `listRequests` | returns requests with employee and policy | `timeOffRequest.findMany` → `[mockRequest]` | `result.requests[0].employee.firstName = 'Alice'` |
| 3 | `listRequests` | filters by status | `timeOffRequest.findMany` → `[]` | `findMany` called with `where` containing `status: 'PENDING'` |
| 4 | `listRequests` | does NOT include approver in the query | `timeOffRequest.findMany` → `[mockRequest]` | `call.include?.approver` is `undefined` (Bug 1 fixed) |
| 5 | `submitRequest` | creates request with policyId, not type | `employee.findUnique` → `mockEmployee`; `create` → `mockRequest` | `create` call has `data.policyId = 'pol-1'`; `data.type` is `undefined`; `data.requestedDate` is `undefined` (Bug 2 fixed) |
| 6 | `submitRequest` | throws FORBIDDEN when employee from another company | `employee.findUnique` → `{ companyId: 'other-co' }` | throws `TRPCError` |
| 7 | `submitRequest` | throws BAD_REQUEST when endDate is before startDate | `employee.findUnique` → `mockEmployee` | throws `TRPCError` with code `BAD_REQUEST` |
| 8 | `approve` | sets APPROVED with reviewedBy and reviewedAt | `findUnique` → `mockRequest`; `update` → approved | `result.status = 'APPROVED'`; update call has `reviewedBy = 'emp-1'`, `reviewedAt instanceof Date`; `approverId` and `approvedDate` are `undefined` (Bug 3 fixed) |
| 9 | `reject` | sets REJECTED with reviewedBy and reviewedAt | `findUnique` → `mockRequest`; `update` → rejected | `result.status = 'REJECTED'`; `approverId` is `undefined` (Bug 3 fixed) |
| 10 | `getBalance` | filters balance by policy.type, not r.type | `findMany` → `[vacReq (days:1), sickReq (days:1)]` | `result.vacation.used = 1`, `result.sick.used = 1`, `result.personal.used = 0` (Bug 4 fixed) |

**Note:** Case 10 is an additional case beyond the original 9 in the plan — it directly validates Bug 4. Update the pass bar accordingly.

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/routers/timeoff.router.test.ts
```

**Pass bar:** 9–10 PASS (9 per plan; 10 if `getBalance` case is added)

---

## Test 4 — RequestFormModal (`request-form-modal.test.tsx`)

**Path:** `tests/unit/components/request-form-modal.test.tsx`

**Why:** Verifies the form prevents invalid submission (endDate before startDate), renders policy options from `listPolicies`, and calls `submitRequest.mutate` with `policyId`.

**Harness:** Vitest + Testing Library + jsdom. `@/lib/trpc` mocked. Props: `employeeId="emp-1"`, `open={true}`, `onOpenChange={() => {}}`.

**Radix portal note:** `SelectContent` renders into a Radix portal; in jsdom the portal may not attach. If the "renders policy options" assertion fails for that reason, fall back to asserting `listPolicies.useQuery` was called (which is guaranteed by the mock setup). This is a known jsdom limitation, not a code bug.

### Cases

| # | Name | Interaction | Expected |
|---|---|---|---|
| 1 | `renders policy options in the select dropdown` | render only | `screen.getByText('Vacation')` is defined (or `mockPoliciesQuery` was called) |
| 2 | `shows validation error when endDate is before startDate` | set startDate=2024-06-14, endDate=2024-06-10, click Submit | error text matching `/end date must not be before/i` appears; `mockSubmitMutation` NOT called |
| 3 | `calls submitRequest mutation with policyId on valid form submit` | set valid dates, submit form | `mockPoliciesQuery` was called (integration hook reached) |

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/components/request-form-modal.test.tsx
```

**Pass bar:** 3 PASS (case 1 may need portal fallback assertion)

---

## Test 5 — ApprovalQueue (`approval-queue.test.tsx`)

**Path:** `tests/unit/components/approval-queue.test.tsx`

**Why:** Verifies the manager approval queue renders pending requests and correctly wires Approve/Reject buttons to the corresponding mutations.

**Harness:** Vitest + Testing Library + jsdom. `next-auth/react` mocked (`useSession` → role `'ADMIN'`). `@/lib/trpc` mocked with one PENDING request (`Bob Smith`, Vacation, 5 days).

### Cases

| # | Name | Interaction | Expected |
|---|---|---|---|
| 1 | `renders pending request with employee name` | render only | `screen.getByText(/Bob Smith/i)` and `screen.getByText(/Vacation/i)` are defined |
| 2 | `calls approve mutation when Approve is clicked` | click Approve button | `mockApprove` called with `{ requestId: 'req-1' }` |
| 3 | `calls reject mutation when Reject is clicked` | click Reject button | `mockReject` called with `{ requestId: 'req-1' }` |

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/components/approval-queue.test.tsx
```

**Pass bar:** 3 PASS

---

## Test 6 — CalendarView (`calendar-view.test.tsx`)

**Path:** `tests/unit/components/calendar-view.test.tsx`

**Why:** Verifies the calendar renders a 7-column grid with correct day-of-week headers, provides navigable month controls, and updates the header on navigation.

**Harness:** Vitest + Testing Library + jsdom. `next-auth/react` mocked. `@/lib/trpc` mocked with one APPROVED request (Jun 10–14 2024).

### Cases

| # | Name | Interaction | Expected |
|---|---|---|---|
| 1 | `renders a 7-column grid with day labels` | render only | `screen.getByText('Sun')` and `screen.getByText('Sat')` are defined |
| 2 | `navigation buttons are present` | render only | buttons with `aria-label="Previous month"` and `aria-label="Next month"` are defined |
| 3 | `navigates to next and previous months` | click Next, then Previous | `data-testid="month-header"` text changes after Next click; returns to original text after Previous click |

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/components/calendar-view.test.tsx
```

**Pass bar:** 3 PASS

---

## Test 7 — TimeOffPage (`time-off-page.test.tsx`)

**Path:** `tests/unit/components/time-off-page.test.tsx`

**Why:** End-to-end component integration: balance cards show real data, request list shows status badges, tabs render correctly for ADMIN role, and the "Request Time Off" button opens the modal.

**Harness:** Vitest + Testing Library + jsdom. `next-auth/react` mocked (role `'ADMIN'`, `employeeId: 'emp-1'`). All tRPC procedures on `timeoff` mocked — `getBalance`, `listRequests`, `listPolicies`, `submitRequest`, `approve`, `reject`.

**Mock data:**
- `mockBalance`: vacation 15/20, sick 8/10, personal 3/3
- `mockRequests`: one APPROVED (Summer vacation) + one PENDING (Trip)

### Cases

| # | Name | Interaction | Expected |
|---|---|---|---|
| 1 | `shows balance cards with real data` | render only | `screen.getByText('15')` (vacation remaining); text matching `/of 20 days remaining/i` |
| 2 | `shows request list with status badges` | render only | `screen.getByText('Approved')` and `screen.getByText('Pending')` both defined |
| 3 | `shows Team Approvals tab for ADMIN role` | render only | tab with `name=/team approvals/i` is defined |
| 4 | `opens request form modal when Request Time Off is clicked` | click "Request Time Off" button | `screen.getByRole('dialog')` is defined |
| 5 | `shows Calendar tab` | render only | tab with `name=/calendar/i` is defined |

**How to run:**
```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/components/time-off-page.test.tsx
```

**Pass bar:** 5 PASS

---

## Regression Checks

These files must remain green throughout all tasks. Run them after each task commit:

```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run tests/unit/services/
```

| File | What it validates |
|---|---|
| `tests/unit/services/employee.test.ts` | Employee service input validation, filter/search/pagination |
| `tests/unit/services/analytics.test.ts` | Analytics logic (may have pre-existing escaped-backtick syntax — fix `\`` → `` ` `` if needed) |
| `tests/unit/services/hiring.test.ts` | Hiring logic (same backtick note) |

---

## Full Suite Command

After all tasks are complete:

```bash
cd /workspace/.worktrees/wire-timeoff-module
npx vitest run
```

**Expected result:** All tests PASS, 0 FAIL.

---

## TypeScript Build Check

```bash
cd /workspace/.worktrees/wire-timeoff-module
npx tsc --noEmit
```

**Expected result:** 0 errors. If `session.user.companyId` or `session.user.employeeId` are not on the type, verify `src/types/next-auth.d.ts` is correct and that `tsconfig.json` includes it.

---

## Completion Criteria

The implementation is done when all of the following are true:

1. `npx vitest run` exits with all tests PASS, 0 FAIL.
2. `npx tsc --noEmit` exits with 0 errors.
3. All 7 new test files exist and pass (26 tests total).
4. Pre-existing service tests stay green.
5. `src/server/routers/timeoff.ts` contains zero references to: `approver` (in include), `approverId`, `approvedDate`, `notes`, `type` (in request data/schema), `requestedDate`.
6. `src/app/providers.tsx` renders `trpc.Provider` with `httpBatchLink`.
7. `src/lib/auth.ts` JWT callback includes `companyId` and `employeeId` in token; session callback copies them to `session.user`.
