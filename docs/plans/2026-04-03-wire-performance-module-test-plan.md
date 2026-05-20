# Test Plan: Wire Performance Module

**Branch:** `wire-performance-module`
**Date:** 2026-04-03
**Linked plan:** `2026-04-03-wire-performance-module.md`
**Goal:** Validate that every performance router procedure returns correctly shaped data (via mocked Prisma), that Bug 1 (`createGoal` missing `keyResults` include) is caught by a RED test and fixed, that the performance UI page contains no hardcoded values, and that all 239 pre-existing tests remain green.

---

## Scope

Two new test files:

| File | Cases | Purpose |
|---|---|---|
| `tests/unit/routers/performance.router.test.ts` | P-1 – P-22 | Router-level unit tests — mocked Prisma, no real DB |
| `tests/unit/components/performance-page.test.tsx` | C-1 – C-10 | Component-level tests — mocked tRPC hooks, no real network |

---

## Part 1 — Router Tests

### Harness Setup

**File:** `tests/unit/routers/performance.router.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const db = {
  reviewCycle:       { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  performanceReview: { create: vi.fn() },
  goal:              { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  employee:          { findUnique: vi.fn() },
};

function makeCtx() {
  return {
    db: db as any,
    session: {
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN',
               companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
      expires: '',
    },
    user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN',
             companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
  };
}

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/server/trpc', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
  const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
  });
  return { router: t.router, publicProcedure: t.procedure,
           protectedProcedure: t.procedure.use(isAuthed) };
});

import { performanceRouter } from '@/server/routers/performance';

function createCaller(ctx: any) {
  return performanceRouter.createCaller(ctx);
}

beforeEach(() => { vi.clearAllMocks(); });
```

### Standard mock shapes

**Review cycle record** (used in `listCycles` / `createCycle` mocks):
```ts
{
  id: 'cycle-1',
  name: 'H1 2026 Review',
  companyId: 'co-1',
  type: 'ANNUAL',
  status: 'DRAFT',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-06-30'),
  createdAt: new Date('2026-01-01'),
  _count: { reviews: 3 },
}
```

**Goal record** (used in `listGoals` / `createGoal` / `updateGoalProgress` mocks):
```ts
{
  id: 'goal-1',
  title: 'Increase test coverage to 80%',
  description: 'Write more unit tests',
  employeeId: 'emp-1',
  companyId: 'co-1',
  type: 'INDIVIDUAL',
  status: 'ACTIVE',
  progress: 65,
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-03-31'),
  createdAt: new Date('2026-01-01'),
  keyResults: [
    { id: 'kr-1', goalId: 'goal-1', title: 'Write 50 new tests', completed: false },
  ],
}
```

**Employee record** (used in permission-check mocks):
```ts
{ id: 'emp-1', companyId: 'co-1', firstName: 'Alice', lastName: 'Smith' }
```

**Performance review record** (used in `submitReview` mock):
```ts
{
  id: 'rev-1',
  cycleId: 'cycle-1',
  employeeId: 'emp-1',
  reviewerId: 'emp-1',
  type: 'MANAGER',
  rating: 4,
  responses: '{}',
  status: 'SUBMITTED',
  submittedAt: new Date(),
  employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith' },
}
```

---

### P-1 — `listCycles`: returns cycles filtered by companyId, includes `_count.reviews`

**Preconditions:**
- `db.reviewCycle.findMany` resolves with one cycle record (see standard shape above, `_count.reviews: 3`).

**Call:** `caller.listCycles({ limit: 10 })`

**Assertions:**
1. Result `cycles` has length 1.
2. `cycles[0].name` equals `'H1 2026 Review'`.
3. `cycles[0]._count.reviews` equals `3`.
4. `db.reviewCycle.findMany` was called with `where` containing `{ companyId: 'co-1' }`.
5. `result.nextCursor` is `undefined`.

---

### P-2 — `listCycles`: applies `status` filter when provided

**Preconditions:**
- `db.reviewCycle.findMany` resolves with one cycle record with `status: 'ACTIVE'`.

**Call:** `caller.listCycles({ status: 'ACTIVE', limit: 10 })`

**Assertions:**
1. `db.reviewCycle.findMany` was called with `where` containing `{ companyId: 'co-1', status: 'ACTIVE' }`.
2. `cycles[0].status` equals `'ACTIVE'`.

---

### P-3 — `listCycles`: returns empty array when no cycles exist

**Preconditions:**
- `db.reviewCycle.findMany` resolves with `[]`.

**Call:** `caller.listCycles({ limit: 10 })`

**Assertions:**
1. `result.cycles` deep-equals `[]`.
2. `result.nextCursor` is `undefined`.

---

### P-4 — `listCycles`: returns `nextCursor` when result set exceeds limit

**Preconditions:**
- `db.reviewCycle.findMany` resolves with 3 records (ids: `'cycle-1'`, `'cycle-2'`, `'cycle-3'`) when `take` is `limit + 1 = 3`.

**Call:** `caller.listCycles({ limit: 2 })`

**Assertions:**
1. `result.cycles` has length 2.
2. `result.nextCursor` equals `'cycle-3'`.

---

### P-5 — `createCycle`: creates cycle with all fields, returns record with `_count.reviews = 0`

**Preconditions:**
- `db.reviewCycle.create` resolves with a cycle record where `_count: { reviews: 0 }`, `name: 'Q1 Review'`, `type: 'QUARTERLY'`, `status: 'DRAFT'`.

**Call:**
```ts
caller.createCycle({
  name: 'Q1 Review',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-03-31'),
  type: 'QUARTERLY',
  status: 'DRAFT',
})
```

**Assertions:**
1. `result.name` equals `'Q1 Review'`.
2. `result._count.reviews` equals `0`.
3. `db.reviewCycle.create` was called with `data` containing `{ companyId: 'co-1', name: 'Q1 Review' }`.
4. `db.reviewCycle.create` was called with `include: { _count: { select: { reviews: true } } }`.

---

### P-6 — `createCycle`: throws BAD_REQUEST when `startDate >= endDate`

**Preconditions:**
- `db.reviewCycle.create` is never called.

**Call:**
```ts
caller.createCycle({
  name: 'Bad Cycle',
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-01-01'),
  type: 'ANNUAL',
  status: 'DRAFT',
})
```

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'BAD_REQUEST'`.
3. `db.reviewCycle.create` was not called.

---

### P-7 — `createCycle`: injects `companyId` from context, not from input

**Preconditions:**
- `db.reviewCycle.create` resolves with a cycle record containing `companyId: 'co-1'`.

**Call:**
```ts
caller.createCycle({
  name: 'New Cycle',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-06-30'),
})
```

**Assertions:**
1. `db.reviewCycle.create` was called with `data` containing `{ companyId: 'co-1' }`.
2. The input to `createCycle` did not include a `companyId` field, confirming the server injects it.

---

### P-8 — `submitReview`: creates review and returns record with `employee` include

**Preconditions:**
- `db.reviewCycle.findUnique` resolves with cycle record `{ id: 'cycle-1', companyId: 'co-1' }`.
- `db.employee.findUnique` resolves with employee record `{ id: 'emp-1', companyId: 'co-1' }`.
- `db.performanceReview.create` resolves with the standard review record (including `employee` sub-object).

**Call:**
```ts
caller.submitReview({ cycleId: 'cycle-1', employeeId: 'emp-1', rating: 4, responses: '{}' })
```

**Assertions:**
1. `result.id` equals `'rev-1'`.
2. `result.rating` equals `4`.
3. `result.employee.firstName` equals `'Alice'`.
4. `result.type` equals `'MANAGER'` (documents Bug 2 — hardcoded type limitation).
5. `db.performanceReview.create` was called with `include: { employee: { select: { id: true, firstName: true, lastName: true } } }`.

---

### P-9 — `submitReview`: throws NOT_FOUND when `cycleId` does not exist

**Preconditions:**
- `db.reviewCycle.findUnique` resolves with `null`.

**Call:** `caller.submitReview({ cycleId: 'nonexistent', employeeId: 'emp-1', rating: 3 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'NOT_FOUND'`.
3. `db.employee.findUnique` was not called.
4. `db.performanceReview.create` was not called.

---

### P-10 — `submitReview`: throws NOT_FOUND when `employeeId` does not exist

**Preconditions:**
- `db.reviewCycle.findUnique` resolves with `{ id: 'cycle-1', companyId: 'co-1' }`.
- `db.employee.findUnique` resolves with `null`.

**Call:** `caller.submitReview({ cycleId: 'cycle-1', employeeId: 'nonexistent', rating: 3 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'NOT_FOUND'`.
3. `db.performanceReview.create` was not called.

---

### P-11 — `submitReview`: throws FORBIDDEN when cycle belongs to a different company

**Preconditions:**
- `db.reviewCycle.findUnique` resolves with `{ id: 'cycle-other', companyId: 'co-2' }`.

**Call:** `caller.submitReview({ cycleId: 'cycle-other', employeeId: 'emp-1', rating: 3 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'FORBIDDEN'`.
3. `db.employee.findUnique` was not called.
4. `db.performanceReview.create` was not called.

---

### P-12 — `submitReview`: throws FORBIDDEN when employee belongs to a different company

**Preconditions:**
- `db.reviewCycle.findUnique` resolves with `{ id: 'cycle-1', companyId: 'co-1' }`.
- `db.employee.findUnique` resolves with `{ id: 'emp-other', companyId: 'co-2' }`.

**Call:** `caller.submitReview({ cycleId: 'cycle-1', employeeId: 'emp-other', rating: 3 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'FORBIDDEN'`.
3. `db.performanceReview.create` was not called.

---

### P-13 — `listGoals`: returns goals with `keyResults` for a valid employee

**Preconditions:**
- `db.employee.findUnique` resolves with `{ id: 'emp-1', companyId: 'co-1' }`.
- `db.goal.findMany` resolves with one goal record including `keyResults` array (1 item).

**Call:** `caller.listGoals({ employeeId: 'emp-1', limit: 10 })`

**Assertions:**
1. `result.goals` has length 1.
2. `result.goals[0].title` equals `'Increase test coverage to 80%'`.
3. `result.goals[0].keyResults` is an array of length 1.
4. `result.goals[0].keyResults[0].title` equals `'Write 50 new tests'`.
5. `db.goal.findMany` was called with `include: { keyResults: true }`.
6. `db.goal.findMany` was called with `where` containing `{ employeeId: 'emp-1' }`.
7. `result.nextCursor` is `undefined`.

---

### P-14 — `listGoals`: throws NOT_FOUND when `employeeId` does not exist

**Preconditions:**
- `db.employee.findUnique` resolves with `null`.

**Call:** `caller.listGoals({ employeeId: 'nonexistent', limit: 10 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'NOT_FOUND'`.
3. `db.goal.findMany` was not called.

---

### P-15 — `listGoals`: throws FORBIDDEN when employee belongs to a different company

**Preconditions:**
- `db.employee.findUnique` resolves with `{ id: 'emp-other', companyId: 'co-2' }`.

**Call:** `caller.listGoals({ employeeId: 'emp-other', limit: 10 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'FORBIDDEN'`.
3. `db.goal.findMany` was not called.

---

### P-16 — `listGoals`: applies `status` filter when provided

**Preconditions:**
- `db.employee.findUnique` resolves with `{ id: 'emp-1', companyId: 'co-1' }`.
- `db.goal.findMany` resolves with one goal with `status: 'ACTIVE'`.

**Call:** `caller.listGoals({ employeeId: 'emp-1', status: 'ACTIVE', limit: 10 })`

**Assertions:**
1. `db.goal.findMany` was called with `where` containing `{ employeeId: 'emp-1', status: 'ACTIVE' }`.
2. `result.goals[0].status` equals `'ACTIVE'`.

---

### P-17 — `createGoal`: creates goal, returns record including `keyResults` (verifies Bug 1 fix)

> **This test is RED until Bug 1 is fixed.** The current router has no `include: { keyResults: true }` on `goal.create`. The test verifies the fix is applied.

**Preconditions:**
- `db.employee.findUnique` resolves with `{ id: 'emp-1', companyId: 'co-1' }`.
- `db.goal.create` resolves with the standard goal record including `keyResults: []` (empty array, representing a brand-new goal).

**Call:**
```ts
caller.createGoal({
  employeeId: 'emp-1',
  title: 'Launch new onboarding flow',
  description: 'Redesign the flow',
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-03-31'),
  type: 'INDIVIDUAL',
})
```

**Assertions:**
1. `result.title` equals `'Launch new onboarding flow'`.
2. `result.status` equals `'ACTIVE'`.
3. `result.progress` equals `0`.
4. `result` has a `keyResults` property (array — may be empty, but must be present).
5. `db.goal.create` was called with `include: { keyResults: true }`.
6. `db.goal.create` was called with `data` containing `{ employeeId: 'emp-1', companyId: 'co-1', status: 'ACTIVE', progress: 0 }`.

---

### P-18 — `createGoal`: throws NOT_FOUND when `employeeId` does not exist

**Preconditions:**
- `db.employee.findUnique` resolves with `null`.

**Call:**
```ts
caller.createGoal({
  employeeId: 'nonexistent',
  title: 'Some Goal',
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-06-30'),
})
```

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'NOT_FOUND'`.
3. `db.goal.create` was not called.

---

### P-19 — `createGoal`: throws FORBIDDEN when employee belongs to a different company

**Preconditions:**
- `db.employee.findUnique` resolves with `{ id: 'emp-other', companyId: 'co-2' }`.

**Call:**
```ts
caller.createGoal({
  employeeId: 'emp-other',
  title: 'Some Goal',
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-06-30'),
})
```

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'FORBIDDEN'`.
3. `db.goal.create` was not called.

---

### P-20 — `updateGoalProgress`: updates progress and returns updated goal

**Preconditions:**
- `db.goal.findUnique` resolves with:
  ```ts
  { id: 'goal-1', employeeId: 'emp-1', progress: 65, employee: { id: 'emp-1', companyId: 'co-1' } }
  ```
- `db.goal.update` resolves with `{ id: 'goal-1', progress: 80, employeeId: 'emp-1' }`.

**Call:** `caller.updateGoalProgress({ goalId: 'goal-1', progress: 80 })`

**Assertions:**
1. `result.progress` equals `80`.
2. `db.goal.findUnique` was called with `where: { id: 'goal-1' }` and `include: { employee: true }`.
3. `db.goal.update` was called with `where: { id: 'goal-1' }` and `data: { progress: 80 }`.

---

### P-21 — `updateGoalProgress`: throws NOT_FOUND when `goalId` does not exist

**Preconditions:**
- `db.goal.findUnique` resolves with `null`.

**Call:** `caller.updateGoalProgress({ goalId: 'nonexistent', progress: 50 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'NOT_FOUND'`.
3. `db.goal.update` was not called.

---

### P-22 — `updateGoalProgress`: throws FORBIDDEN when goal's employee belongs to a different company

**Preconditions:**
- `db.goal.findUnique` resolves with:
  ```ts
  { id: 'goal-other', employeeId: 'emp-other', progress: 20, employee: { id: 'emp-other', companyId: 'co-2' } }
  ```

**Call:** `caller.updateGoalProgress({ goalId: 'goal-other', progress: 50 })`

**Assertions:**
1. Promise rejects with `TRPCError`.
2. Error `code` is `'FORBIDDEN'`.
3. `db.goal.update` was not called.

---

## Part 2 — Component Tests

### Harness Setup

**File:** `tests/unit/components/performance-page.test.tsx`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/trpc', () => {
  const mutationStub = () => ({ mutate: vi.fn(), isLoading: false, isPending: false });
  return {
    trpc: {
      performance: {
        listGoals:           { useQuery: vi.fn() },
        listCycles:          { useQuery: vi.fn() },
        createGoal:          { useMutation: vi.fn(mutationStub) },
        createCycle:         { useMutation: vi.fn(mutationStub) },
        updateGoalProgress:  { useMutation: vi.fn(mutationStub) },
      },
      useContext: vi.fn(() => ({
        performance: {
          listGoals:  { invalidate: vi.fn() },
          listCycles: { invalidate: vi.fn() },
        },
      })),
    },
  };
});

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN', employeeId: 'emp-1' } },
    status: 'authenticated',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/performance',
}));

import { trpc } from '@/lib/trpc';
import PerformancePage from '@/app/(dashboard)/performance/page';
```

### Standard mock data

```ts
const mockGoals = [
  {
    id: 'goal-1',
    title: 'Increase test coverage to 80%',
    status: 'ACTIVE',
    progress: 65,
    dueDate: new Date('2026-03-31'),
    keyResults: [
      { id: 'kr-1', goalId: 'goal-1', title: 'Write 50 new tests', completed: false },
    ],
  },
  {
    id: 'goal-2',
    title: 'Launch new onboarding flow',
    status: 'COMPLETED',
    progress: 100,
    dueDate: new Date('2026-02-28'),
    keyResults: [],
  },
];

const mockCycles = [
  {
    id: 'cycle-1',
    name: 'H1 2026 Review',
    status: 'ACTIVE',
    type: 'ANNUAL',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-06-30'),
    _count: { reviews: 3 },
  },
  {
    id: 'cycle-2',
    name: 'Q4 2025 Review',
    status: 'COMPLETED',
    type: 'QUARTERLY',
    startDate: new Date('2025-10-01'),
    endDate: new Date('2025-12-31'),
    _count: { reviews: 12 },
  },
];
```

### `setupDefaultMocks()` helper

```ts
function setupDefaultMocks() {
  vi.mocked(trpc.performance.listGoals.useQuery).mockReturnValue({
    data: { goals: mockGoals, nextCursor: undefined },
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.performance.listCycles.useQuery).mockReturnValue({
    data: { cycles: mockCycles, nextCursor: undefined },
    isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.performance.createGoal.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
  vi.mocked(trpc.performance.createCycle.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
  vi.mocked(trpc.performance.updateGoalProgress.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
}

beforeEach(() => { vi.clearAllMocks(); setupDefaultMocks(); });
```

---

### C-1 — Active Goals stat card shows count derived from `listGoals` data, not hardcoded

**Setup:** Default mocks. `mockGoals` has 1 goal with `status: 'ACTIVE'` and 1 with `status: 'COMPLETED'`.

**Render:** `<PerformancePage />`

**Assertions:**
1. The Active Goals stat card displays `'1'` (count of ACTIVE goals).
2. No element with text `'2'` appears as the Active Goals stat value.
3. The hardcoded title strings from the static page (`"Increase test coverage to 80%"` as a stat) do not appear as stat values.

---

### C-2 — Active Cycles stat card shows count derived from `listCycles` data, not hardcoded

**Setup:** Default mocks. `mockCycles` has 1 cycle with `status: 'ACTIVE'` and 1 with `status: 'COMPLETED'`.

**Render:** `<PerformancePage />`

**Assertions:**
1. The Active Cycles stat card displays `'1'` (count of ACTIVE cycles).

---

### C-3 — Avg Rating stat card shows N/A (no review aggregate endpoint)

**Setup:** Default mocks.

**Render:** `<PerformancePage />`

**Assertions:**
1. At least one element with text `'N/A'` is in the document (the Avg Rating stat card).
2. No hardcoded value `'4.5'` or `'4.2'` (from the old static reviews array) appears in the document as a stat card value.

---

### C-4 — Goals tab renders goal titles from `listGoals` data, not hardcoded strings

**Setup:** Default mocks.

**Render:** `<PerformancePage />`

**Assertions:**
1. `'Increase test coverage to 80%'` is in the document (from `mockGoals`).
2. `'Launch new onboarding flow'` is in the document (from `mockGoals`).
3. `'Reduce API response time by 30%'` is NOT in the document (was only in the old hardcoded `goals` array, not in `mockGoals`).

---

### C-5 — Goals tab renders progress bars with correct widths from `goal.progress`

**Setup:** Default mocks.

**Render:** `<PerformancePage />`

**Assertions:**
1. An element with inline style `width: '65%'` (or equivalent) is present, corresponding to `goal-1.progress = 65`.
2. An element with inline style `width: '100%'` is present, corresponding to `goal-2.progress = 100`.
3. No element with inline style `width: '40%'` is present (was only in the old hardcoded `goals` array).

---

### C-6 — Review Cycles tab renders cycle names from `listCycles` data, not hardcoded strings

**Setup:** Default mocks.

**Render:** `<PerformancePage />`

**Precondition for assertion:** Click the "Review Cycles" tab trigger to switch to the cycles tab.

**Assertions:**
1. `'H1 2026 Review'` is in the document (from `mockCycles`).
2. `'Q4 2025 Review'` is in the document (from `mockCycles`).
3. `'Tom Wilson'` is NOT in the document (was only in the old hardcoded `reviews` array).
4. `'Peer Review'` is NOT in the document (was only in the old hardcoded `reviews` array).

---

### C-7 — Skeleton loading states appear when `listGoals` is loading

**Setup:** Override `listGoals.useQuery` mock:
```ts
vi.mocked(trpc.performance.listGoals.useQuery).mockReturnValue({
  data: undefined, isLoading: true, error: null,
} as any);
```

**Render:** `<PerformancePage />`

**Assertions:**
1. At least one element with class `animate-pulse` (or `data-testid="skeleton"`) is present inside the goals tab content.
2. `'Increase test coverage to 80%'` is NOT in the document.
3. No hardcoded goal titles from the old static array are present.

---

### C-8 — Empty state message appears when `listGoals` returns no goals

**Setup:** Override `listGoals.useQuery` mock:
```ts
vi.mocked(trpc.performance.listGoals.useQuery).mockReturnValue({
  data: { goals: [], nextCursor: undefined }, isLoading: false, error: null,
} as any);
```

**Render:** `<PerformancePage />`

**Assertions:**
1. The text `"No goals yet"` (or matching `/no goals yet/i`) appears in the document.
2. `'Increase test coverage to 80%'` is NOT in the document.
3. The Active Goals stat card displays `'0'`.

---

### C-9 — "New Goal" button opens CreateGoal modal with correct form fields

**Setup:** Default mocks. Page starts on Goals tab (default).

**Render:** `<PerformancePage />`

**Action:** Click the button with accessible name matching `/new goal/i`.

**Assertions:**
1. A form field with label/placeholder matching `/title/i` is in the document.
2. A form field with label/placeholder matching `/description/i` is in the document.
3. A form field with label/placeholder matching `/start.*date/i` (or `type="date"` labelled `startDate`) is in the document.
4. A form field with label/placeholder matching `/due.*date/i` (or `type="date"` labelled `dueDate`) is in the document.
5. A select or form field for `type` is in the document with options including `'INDIVIDUAL'`.
6. No `employeeId` input is visible in the modal (it is injected from session server-side, not shown).
7. A submit button with accessible name matching `/create goal|submit/i` is in the document.

---

### C-10 — "New Cycle" button (on Reviews tab) opens CreateCycle modal with correct form fields

**Setup:** Default mocks.

**Render:** `<PerformancePage />`

**Action sequence:**
1. Click the "Review Cycles" tab trigger to switch tabs.
2. Click the button with accessible name matching `/new cycle/i`.

**Assertions:**
1. A form field with label/placeholder matching `/name/i` is in the document.
2. A form field for `startDate` (`type="date"`) is in the document.
3. A form field for `endDate` (`type="date"`) is in the document.
4. A select or form field for `type` is in the document with options including `'ANNUAL'`, `'QUARTERLY'`, `'MONTHLY'`, `'CUSTOM'`.
5. A select or form field for `status` is in the document with options including `'DRAFT'`, `'ACTIVE'`, `'COMPLETED'`.
6. A submit button with accessible name matching `/create cycle|submit/i` is in the document.

---

## Test Execution Order

Per the implementation plan's TDD approach:

1. **Write P-1 through P-22** (router tests) — all RED before Bug 1 fix.
2. **Fix Bug 1** (add `include: { keyResults: true }` to `createGoal`) — P-17 goes GREEN.
3. **Write C-1 through C-10** (component tests) — all RED before page is wired.
4. **Implement `PerformancePage`** — C-1 through C-10 go GREEN.
5. **Run full suite** — verify 239 pre-existing tests + 32 new tests (22 + 10) all pass.

---

## Known Limitations Documented by Tests

- **P-8 (Bug 2):** `submitReview` hardcodes `type: 'MANAGER'`. Test asserts `result.type === 'MANAGER'` to document this limitation. No fix required for initial wiring pass.
- **C-3:** Avg Rating shows `'N/A'` because no `listReviews` procedure exists in the router. This is by design for this wiring pass.
- **`submitReview` UI:** Not wired in the page for this pass. P-8 through P-12 test the router procedure; no component tests for `submitReview` UI are included.
