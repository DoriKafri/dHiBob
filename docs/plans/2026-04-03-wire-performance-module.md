# Wire Performance Module — Implementation Plan
**Date:** 2026-04-03  
**Branch:** `wire-performance-module`  
**Author:** DHiBob Dev

---

## 1. Current State

`src/app/(dashboard)/performance/page.tsx` is a static client component with two hardcoded arrays (`goals`, `reviews`) and no tRPC calls. It renders a two-tab layout (Goals & OKRs / Reviews) but does not connect to the database.

The `performanceRouter` at `src/server/routers/performance.ts` is fully implemented with 6 procedures and is mounted at the `performance` namespace in `_app.ts`. The `trpc` client object is typed via `AppRouter`, so `trpc.performance.*` hooks are already available on the client.

---

## 2. Router Bug Analysis

After cross-referencing the router code against the Prisma schema, the following bugs are identified. All must be fixed before wiring the UI.

### Bug 1 — `createGoal` does not return `keyResults` include
- **Location:** `src/server/routers/performance.ts`, `createGoal` mutation (line 95-98)
- **Problem:** `ctx.db.goal.create(...)` has no `include` clause. `listGoals` returns goals with `keyResults` included, but `createGoal` does not. On the client, after a successful `createGoal` mutation we invalidate the `listGoals` query, so this is not a runtime crash — but the returned object shape is inconsistent with what `listGoals` returns. The router test P-17 (see Section 5) will verify the returned shape includes `keyResults`.
- **Fix:** Add `include: { keyResults: true }` to the `goal.create(...)` call in `createGoal`.

### Bug 2 — `submitReview` hardcodes `type: 'MANAGER'`
- **Location:** `src/server/routers/performance.ts`, `submitReview` mutation (line 64)
- **Problem:** The `type` field is hardcoded to `'MANAGER'` even though the schema stores it as a plain `String`. This is not a crash, but means submitting self-reviews or peer reviews is impossible. The `submitReviewSchema` does not expose a `type` field.
- **Severity:** Low for initial wiring (the page only exposes a simple submit form), but the test suite should document this limitation. No fix required before initial wiring; mark as a known limitation in the test.

### Bug 3 — `listGoals` requires `employeeId` as input but the page has no session-derived `employeeId` in the current hardcoded implementation
- **Location:** `src/app/(dashboard)/performance/page.tsx`
- **Problem:** Not a router bug — the router is correct. The page must call `useSession()` to get `session.user.employeeId`. This field is typed as `string | undefined` in the next-auth type declaration. The page must handle the case where `employeeId` is `undefined` (i.e., the user has no linked employee record) by disabling the query.
- **Fix:** In the page, call `useSession()`, extract `employeeId`, and pass `enabled: !!employeeId` to `listGoals.useQuery`.

### No Bug — `_count.reviews` field name
- The router uses `_count: { select: { reviews: true } }` which matches the `ReviewCycle` model's `reviews PerformanceReview[]` relation name. Correct.

### No Bug — `updateGoalProgress` access control
- Uses `goal.employee.companyId` for the check, and `Goal.employeeId` is nullable in the schema. If `employee` is null (company-level goal), the check is skipped (`goal.employee &&`). This is intentional and correct for the current schema.

---

## 3. Page Structure

The new page is a full replacement of the current static page. It uses the same two-tab layout but adds stat cards, loading states, empty states, and two modals.

```
PerformancePage
├── Header row
│   ├── <h1>Performance</h1>
│   └── <Button "New Goal"> — opens CreateGoalModal (Goals tab) or CreateCycleModal (Reviews tab)
│       Strategy: show "New Goal" when on Goals tab, "New Cycle" when on Reviews tab
├── Stat Cards (grid, 3 cards)
│   ├── Active Goals — count from listGoals where status='ACTIVE'
│   ├── Active Cycles — count from listCycles where status='ACTIVE'
│   └── Avg Rating — derived client-side from visible reviews (N/A if none)
├── Tabs
│   ├── TabsTrigger "Goals & OKRs"
│   └── TabsTrigger "Review Cycles"
│
├── TabsContent "goals"
│   ├── Loading: 3x Skeleton cards
│   ├── Empty: "No goals yet. Click 'New Goal' to get started."
│   └── Goal cards (one per goal from listGoals)
│       ├── Title + Target icon
│       ├── Status badge (ACTIVE→"secondary", COMPLETED→"success", CANCELLED→"warning")
│       ├── Progress bar (goal.progress %)
│       ├── Due date (formatted from goal.dueDate)
│       └── Key Results count badge (goal.keyResults.length)
│           (Inline "Update Progress" button → calls updateGoalProgress mutation)
│
└── TabsContent "reviews" (Review Cycles)
    ├── Loading: 3x Skeleton cards
    ├── Empty: "No review cycles yet. Click 'New Cycle' to create one."
    └── Cycle cards (one per cycle from listCycles)
        ├── Cycle name + Star icon
        ├── Status badge (DRAFT→"secondary", ACTIVE→"success", COMPLETED→"warning")
        ├── Date range (startDate — endDate)
        ├── Type badge (e.g. ANNUAL, QUARTERLY)
        └── Review count (_count.reviews)
```

---

## 4. tRPC Hook Wiring

### Session
```ts
const { data: session } = useSession();
const employeeId = session?.user?.employeeId;
```

### Goals tab
| Hook | Input | `enabled` guard | Used for |
|------|-------|-----------------|----------|
| `trpc.performance.listGoals.useQuery` | `{ employeeId: employeeId!, limit: 100 }` | `!!employeeId` | Goal cards list |
| `trpc.performance.createGoal.useMutation` | from modal | — | CreateGoalModal submit |
| `trpc.performance.updateGoalProgress.useMutation` | `{ goalId, progress }` | — | Inline progress slider/input |

On `createGoal` success: `utils.performance.listGoals.invalidate()`.  
On `updateGoalProgress` success: `utils.performance.listGoals.invalidate()`.

### Review Cycles tab
| Hook | Input | `enabled` guard | Used for |
|------|-------|-----------------|----------|
| `trpc.performance.listCycles.useQuery` | `{ limit: 100 }` | — | Cycle cards list |
| `trpc.performance.createCycle.useMutation` | from modal | — | CreateCycleModal submit |

On `createCycle` success: `utils.performance.listCycles.invalidate()`.  
(Note: `submitReview` is out of scope for this wiring pass — no submit UI is planned in the cycle card; add as a TODO comment.)

### Stat Cards — derived values
- **Active Goals:** `goalsData?.goals.filter(g => g.status === 'ACTIVE').length ?? 0` — show `"—"` while loading, or `"N/A"` if no `employeeId`
- **Active Cycles:** `cyclesData?.cycles.filter(c => c.status === 'ACTIVE').length ?? 0` — show `"—"` while loading
- **Avg Rating:** `"N/A"` (no `listReviews` procedure exists in the current router)

---

## 5. The `employeeId` Problem

`listGoals` and `createGoal` both require `employeeId` in their input schemas. The router validates employee ownership and company membership using this field.

**Source:** `ctx.user.employeeId` flows from the NextAuth session. In `src/types/next-auth.d.ts`, `employeeId` is typed as `string | undefined`. It is populated when a `User` record has a linked `Employee` (via the `User.employeeId` field in the schema).

**Page strategy:**
1. Call `useSession()` and extract `session?.user?.employeeId`.
2. Pass `enabled: !!employeeId` to `listGoals.useQuery` to prevent firing the query unauthenticated.
3. When `employeeId` is `undefined`, render a fallback message in the Goals tab: `"No employee profile linked to your account."` instead of an empty state.
4. The `createGoal` modal submit handler must gate on `!!employeeId` before calling `mutate`.

**Mock in component tests:** `useSession` mock returns `{ user: { employeeId: 'emp-1', companyId: 'co-1', ... } }` so tests always have a valid `employeeId`.

---

## 6. Loading States

Use a `Skeleton` component (same pattern as `hiring/page.tsx`):

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      data-testid="skeleton"
      className={`animate-pulse bg-gray-200 rounded ${className ?? ""}`}
    />
  );
}
```

- While `goalsLoading` (listGoals): render 3x `<Skeleton className="h-20 w-full" />` inside the goals TabsContent
- While `cyclesLoading` (listCycles): render 3x `<Skeleton className="h-20 w-full" />` inside the cycles TabsContent
- Stat card slots: render `<Skeleton className="h-24" />` per card while loading (matching hiring page pattern)

---

## 7. Empty States

- Goals tab, no goals: `<p>No goals yet. Click &apos;New Goal&apos; to get started.</p>`
- Goals tab, no `employeeId`: `<p>No employee profile linked to your account.</p>`
- Review Cycles tab, no cycles: `<p>No review cycles yet. Click &apos;New Cycle&apos; to create one.</p>`

---

## 8. CreateGoal Modal Fields

Maps to `createGoalSchema`:

| Field | Input type | Required | Notes |
|-------|-----------|----------|-------|
| `title` | text | yes | min 1 char |
| `description` | textarea | no | optional |
| `startDate` | date | yes | `z.coerce.date()` — use `<input type="date">` |
| `dueDate` | date | yes | `z.coerce.date()` — use `<input type="date">` |
| `type` | select | no | Options: INDIVIDUAL (default), TEAM, COMPANY |

`employeeId` is injected from session — not shown in the form.

---

## 9. CreateCycle Modal Fields

Maps to `createCycleSchema`:

| Field | Input type | Required | Notes |
|-------|-----------|----------|-------|
| `name` | text | yes | min 1 char |
| `startDate` | date | yes | `z.coerce.date()` |
| `endDate` | date | yes | `z.coerce.date()`. Router throws BAD_REQUEST if startDate >= endDate — display inline error on mutation error |
| `type` | select | no | Options: ANNUAL (default), QUARTERLY, MONTHLY, CUSTOM |
| `status` | select | no | Options: DRAFT (default), ACTIVE, COMPLETED |

---

## 10. TDD Execution Order

All tests must be written first (RED), then implementation makes them GREEN.

### Step 1 — Write router tests (RED)
File: `tests/unit/routers/performance.router.test.ts`

Follow the exact same scaffolding pattern as `tests/unit/routers/hiring.router.test.ts`:
- Mock `@/lib/db` and `@/server/trpc` at the top
- `makeCtx()` returns `{ db, session, user }` with `user.employeeId = 'emp-1'`
- `db` mock object must include: `reviewCycle`, `performanceReview`, `goal`, `employee`

Test cases:

| ID | Procedure | Scenario |
|----|-----------|----------|
| P-1 | `listCycles` | Returns cycles filtered by companyId, includes `_count.reviews` |
| P-2 | `listCycles` | Applies `status` filter when provided |
| P-3 | `listCycles` | Returns empty array when no cycles exist |
| P-4 | `listCycles` | Returns `nextCursor` when result set exceeds limit |
| P-5 | `createCycle` | Creates cycle with all fields, returns record with `_count.reviews = 0` |
| P-6 | `createCycle` | Throws BAD_REQUEST when `startDate >= endDate` |
| P-7 | `createCycle` | Injects `companyId` from context (not from input) |
| P-8 | `submitReview` | Creates review and returns record with `employee` include |
| P-9 | `submitReview` | Throws NOT_FOUND when `cycleId` does not exist |
| P-10 | `submitReview` | Throws NOT_FOUND when `employeeId` does not exist |
| P-11 | `submitReview` | Throws FORBIDDEN when cycle belongs to a different company |
| P-12 | `submitReview` | Throws FORBIDDEN when employee belongs to a different company |
| P-13 | `listGoals` | Returns goals with `keyResults` for a valid employee |
| P-14 | `listGoals` | Throws NOT_FOUND when `employeeId` does not exist |
| P-15 | `listGoals` | Throws FORBIDDEN when employee belongs to a different company |
| P-16 | `listGoals` | Applies `status` filter when provided |
| P-17 | `createGoal` | Creates goal, returns record including `keyResults` (verifies Bug 1 fix) |
| P-18 | `createGoal` | Throws NOT_FOUND when `employeeId` does not exist |
| P-19 | `createGoal` | Throws FORBIDDEN when employee belongs to a different company |
| P-20 | `updateGoalProgress` | Updates progress and returns updated goal |
| P-21 | `updateGoalProgress` | Throws NOT_FOUND when `goalId` does not exist |
| P-22 | `updateGoalProgress` | Throws FORBIDDEN when goal's employee belongs to a different company |

### Step 2 — Fix Bug 1 (RED → GREEN for P-17)
File: `src/server/routers/performance.ts`
- Add `include: { keyResults: true }` to `goal.create(...)` in `createGoal`.

### Step 3 — Write component tests (RED)
File: `tests/unit/components/performance-page.test.tsx`

Follow the exact same scaffolding pattern as `tests/unit/components/hiring-page.test.tsx`:
- `vi.mock('@/lib/trpc', ...)` — stub all 5 used hooks
- `vi.mock('next-auth/react', ...)` — return `employeeId: 'emp-1'`
- `vi.mock('next/navigation', ...)` — stub router/pathname
- `setupDefaultMocks()` helper resets all mocks before each test

Mock shape for `trpc` in component tests:
```ts
{
  performance: {
    listGoals: { useQuery: vi.fn() },
    listCycles: { useQuery: vi.fn() },
    createGoal: { useMutation: vi.fn(mutationStub) },
    createCycle: { useMutation: vi.fn(mutationStub) },
    updateGoalProgress: { useMutation: vi.fn(mutationStub) },
  },
  useContext: vi.fn(() => ({
    performance: {
      listGoals: { invalidate: vi.fn() },
      listCycles: { invalidate: vi.fn() },
    },
  })),
}
```

Test cases:

| ID | Scenario |
|----|----------|
| C-1 | Active Goals stat card shows count derived from `listGoals` data, not hardcoded |
| C-2 | Active Cycles stat card shows count derived from `listCycles` data, not hardcoded |
| C-3 | Avg Rating stat card shows N/A (no review aggregate endpoint) |
| C-4 | Goals tab renders goal titles from `listGoals` data, not hardcoded strings |
| C-5 | Goals tab renders progress bars with correct widths from `goal.progress` |
| C-6 | Review Cycles tab renders cycle names from `listCycles` data, not hardcoded strings |
| C-7 | Skeleton loading states appear when `listGoals` is loading |
| C-8 | Empty state message appears when `listGoals` returns no goals |
| C-9 | "New Goal" button opens CreateGoal modal with correct form fields (title, description, startDate, dueDate, type) |
| C-10 | "New Cycle" button (on Reviews tab) opens CreateCycle modal with correct form fields (name, startDate, endDate, type, status) |

### Step 4 — Implement the page (RED → GREEN for C-1 to C-10)
File: `src/app/(dashboard)/performance/page.tsx`

Replace the entire file. Implementation checklist:
- [ ] `"use client"` directive
- [ ] Imports: `useState`, `useMemo` from react; `useSession` from next-auth/react; `trpc` from @/lib/trpc; all UI components
- [ ] `Skeleton` component (copy pattern from hiring page)
- [ ] `goalStatusVariant` helper
- [ ] `cycleStatusVariant` helper
- [ ] `CreateGoalModal` component
- [ ] `CreateCycleModal` component
- [ ] `PerformancePage` default export:
  - `useSession()` → extract `employeeId`
  - `const [activeTab, setActiveTab] = useState("goals")`
  - `const [showCreateGoal, setShowCreateGoal] = useState(false)`
  - `const [showCreateCycle, setShowCreateCycle] = useState(false)`
  - `listGoals.useQuery(...)` with `enabled: !!employeeId`
  - `listCycles.useQuery(...)`
  - `createGoal.useMutation(...)` with `onSuccess` invalidate + close modal
  - `createCycle.useMutation(...)` with `onSuccess` invalidate + close modal
  - `updateGoalProgress.useMutation(...)` with `onSuccess` invalidate
  - Stat cards: Active Goals, Active Cycles, Avg Rating (N/A)
  - Tabs with Goals and Review Cycles content
  - Conditional modals

### Step 5 — Run full test suite, verify 239 + 32 new tests pass
```bash
npx vitest run
```

---

## 11. File Change Summary

| File | Action |
|------|--------|
| `src/server/routers/performance.ts` | Fix Bug 1: add `include: { keyResults: true }` to `createGoal` |
| `src/app/(dashboard)/performance/page.tsx` | Full replacement with wired component |
| `tests/unit/routers/performance.router.test.ts` | New file — 22 router test cases |
| `tests/unit/components/performance-page.test.tsx` | New file — 10 component test cases |

No schema changes. No new dependencies. No changes to `_app.ts`, `trpc.ts`, or `providers.tsx`.

---

## 12. Key Design Decisions

1. **Tab-aware header button:** The header shows "New Goal" when on the goals tab and "New Cycle" when on the reviews tab. This requires tracking the active tab in state and wiring `onValueChange` on the `<Tabs>` component.

2. **No `submitReview` UI in this pass:** The `submitReview` procedure is tested in the router tests (P-8 through P-12) but no UI is wired for it. A TODO comment in the page marks this for a future ticket.

3. **`updateGoalProgress` inline UX:** Each goal card will have a numeric input (0–100) pre-filled with `goal.progress` and an "Update" button. This keeps the UI simple while exercising the mutation.

4. **`listGoals` pagination:** `limit: 100` for initial pass; a TODO comment marks future pagination, consistent with the hiring page pattern.

5. **Error handling:** `createCycle` can throw `BAD_REQUEST` (startDate >= endDate). The mutation's `onError` callback will set a local `cycleError` state string, which is displayed inside the modal above the submit button.

6. **`employeeId` undefined guard:** When `employeeId` is undefined the goals tab shows a message rather than a spinner or error crash. The `listGoals` query is disabled (not fired) in this case, avoiding a 400 from the router.
