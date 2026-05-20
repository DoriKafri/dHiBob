# Wire Hiring Module — Implementation Plan

**Date:** 2026-04-03  
**Branch:** `wire-hiring-module`  
**Scope:** Replace all hardcoded data in `src/app/(dashboard)/hiring/page.tsx` with real tRPC calls to `hiringRouter`.

---

## 1. Bugs and Schema Mismatches in the Existing Router

### 1.1 `createJob` — Missing Fields in DB Write

**File:** `src/server/routers/hiring.ts`, lines 49–56

The `createJobSchema` accepts `department` (plain string), `location` (plain string), and `jobType` (`FULL_TIME` | `PART_TIME` | `CONTRACT`).

The `JobPosting` model in `prisma/schema.prisma` has:
- `departmentId String?` — a relation ID, NOT a plain string field named `department`
- `siteId String?` — a relation ID, NOT a plain `location` string
- NO `jobType` column at all (the model has no such field)

The `createJob` mutation's `data` object only writes `title`, `description`, `salaryMin`, `salaryMax`, `status`, and `companyId`. The schema inputs `department`, `location`, and `jobType` are **silently dropped** — they are never written to the DB.

**Impact on the page rewrite:** The `createJob` form should only collect fields that the router actually persists. The `department`, `location`, and `jobType` inputs are accepted by the schema validator but never stored. For the wiring task this means:
- Do NOT plumb `department`/`location`/`jobType` through a form expecting them to round-trip — they won't.
- The "Post Job" modal can include them in the UI for future compatibility, but must note they are currently no-ops in the DB write.
- The router **itself must be fixed** (or at minimum documented as a known bug) before the form is fully functional.

**Fix required in router** (add to `createJob` mutation's `data` block):
```ts
data: {
  title, description, salaryMin, salaryMax, status,
  companyId: ctx.user.companyId,
  // departmentId and siteId need to be passed and looked up separately
  // jobType has no column — remove from schema or add migration
}
```
For the wiring task, the minimal safe fix is to remove `department`, `location`, and `jobType` from `createJobSchema`, or add a comment that they are accepted but not persisted. The plan below opts to **remove them from the schema** and update the form accordingly to avoid confusion.

### 1.2 `listJobs` — `department` Filter Uses Wrong Field

The `listJobsSchema` accepts `department: z.string().optional()` and applies it as `where.department = department`. The `JobPosting` model has no `department` column — it has `departmentId`. This filter will silently match nothing (Prisma ignores unknown where keys in some configurations, or throws at runtime).

**Fix:** Either remove the `department` filter or change it to `departmentId`. For the page rewrite, simply do not pass `department` as a filter (call `listJobs` without it) — the stat card derivation doesn't need it.

### 1.3 `addCandidate` — `phone` Is Required in Schema but Optional in DB

The `addCandidateSchema` marks `phone: z.string()` as required (no `.optional()`). The `Candidate` model marks `phone String?` as optional. This is a minor mismatch: the router is more restrictive than the DB. No runtime crash results, but forms must include a phone field or the mutation will reject valid candidates who have no phone.

**Decision for wiring:** Keep the router as-is (required phone). The AddCandidate modal must include a phone field.

### 1.4 `Candidate.stage` Default vs. Router Enum

The `Candidate` model defines `stage String @default("APPLIED")`. The `listCandidatesSchema` filters by stage with enum `['SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']` — `APPLIED` is **not in this enum**. Candidates who have just been added (`stage = 'APPLIED'`) cannot be filtered for via `listCandidates` with `stage` input.

The `addCandidate` mutation also forces `stage: 'SCREENING'` (overriding the DB default of `APPLIED`). So in practice new candidates start as `SCREENING` via the router.

**Impact on pipeline board:** The pipeline UI uses stages `['Applied', 'Screening', 'Interview', 'Offer', 'Hired']`. The `listCandidates` enum excludes `APPLIED` as a filter value, but the current page's hardcoded `pipelineStages` array starts with "Applied". If we fetch all-stages candidates (no `stage` filter), we rely on the returned `stage` field to bucket them client-side.

**Decision for wiring:** Fetch candidates without a `stage` filter (returning all stages for a given job), then bucket client-side into pipeline columns. The pipeline columns shown in the UI are `SCREENING | INTERVIEW | OFFER | HIRED | REJECTED` — drop the "Applied" column (which doesn't match the router's actual stage values). This aligns the page with what the DB actually stores.

### 1.5 `JobPosting.status` Default vs. Router Enum

The `JobPosting` model uses `status String @default("DRAFT")`. The `listJobsSchema` filters by `status: z.enum(['OPEN', 'CLOSED', 'ON_HOLD'])`. There is no `DRAFT` in the enum. A newly created job defaults to `DRAFT` in the DB, but `createJob` defaults `status` to `OPEN` via the router.

The `listJobs` call with `status: 'OPEN'` will correctly return jobs with status `OPEN`. The stat card "Open Positions" should call `listJobs({ status: 'OPEN' })`.

**No code fix required** for the page wiring — just be aware that DRAFT jobs from other sources won't appear.

### 1.6 `JobPosting` Has No `location` or `jobType` String Fields

As noted in 1.1, the page currently displays `j.location` from hardcoded data. After wiring, job cards cannot show a location string because the router's response only includes `departmentId` (a relation ID) and `siteId` (a relation ID). The related `department` and `site` objects are not included in the `listJobs` query.

**Fix options:**
- A) Add `include: { department: true, site: true }` to the `listJobs` Prisma query so that `job.department.name` and `job.site.name` are available.
- B) Display only title, candidate count, and status — omit department/location.

**Decision:** Option A (add `include`) is the right long-term fix and is straightforward. The page rewrite should include this in the `listJobs` Prisma call update. This is a **router fix** that must be done alongside the page rewrite.

---

## 2. Stat Card Derivations

The page currently shows four hardcoded stat cards. Here is how each will be derived from live data:

| Card | Current | Source | Derivation |
|---|---|---|---|
| Open Positions | `8` | `trpc.hiring.listJobs({ limit: 100 })` — single shared query | `jobsData.jobs.filter(j => j.status === 'OPEN').length` (client-side filter; avoids a second network call) |
| Total Candidates | `73` | Same `trpc.hiring.listJobs({ limit: 100 })` query | Sum of `job._count.candidates` across all returned jobs |
| Avg Time to Hire | `"23d"` | `trpc.analytics.timeToHire(...)` already available | Read the most recent month's `avgDays` value, or display `"N/A"` and note it comes from analytics |
| Offers Accepted | `3` | No direct procedure exists | Count candidates in `HIRED` stage across all jobs (requires iterating `listCandidates` per job) or derive from the `listJobs` aggregate. **Practical decision:** show `"N/A"` for now, same as analytics eNPS. This avoids N+1 queries without a dedicated endpoint. |

**Stat card loading states:** Show `<Skeleton className="h-24" />` per card while `isLoading` is true (matching analytics page pattern).

### Stat Card Query Plan

```tsx
// Single query for both Open Positions and Total Candidates
const { data: jobsData, isLoading: jobsLoading } =
  trpc.hiring.listJobs.useQuery({ limit: 100 });

// Derived values
const openPositions = jobsLoading ? "—" : String(
  jobsData?.jobs.filter(j => j.status === 'OPEN').length ?? 0
);
const totalCandidates = jobsLoading ? "—" : String(
  jobsData?.jobs.reduce((sum, j) => sum + j._count.candidates, 0) ?? 0
);
// Avg Time to Hire: "N/A" (no dedicated hiring router procedure; analytics.timeToHire exists but is scoped to analytics page)
// Offers Accepted: "N/A" (no aggregate endpoint)
```

---

## 3. Open Positions List Rewrite

**Current:** hardcoded `jobs` array with `.title`, `.department`, `.location`, `.candidates`, `.status`, `.posted`.

**After wiring:** map `jobsData.jobs` from `listJobs`.

Field mapping:
- `j.title` → `job.title`
- `j.department` → `job.department?.name ?? "—"` (requires `include: { department: true }` fix in router)
- `j.location` → `job.site?.name ?? "—"` (requires `include: { site: true }` fix in router)
- `j.candidates` → `job._count.candidates`
- `j.status` → `job.status` (values: `OPEN`, `CLOSED`, `ON_HOLD`)
- `j.posted` → format `job.createdAt` as relative time (e.g., `"2 weeks ago"`) using a `formatRelative(date)` helper

**Badge variant mapping:**
- `OPEN` → `"success"` (green)
- `CLOSED` → `"secondary"` (gray)
- `ON_HOLD` → `"warning"` (yellow, if variant exists; else `"secondary"`)

**Empty state:** When `jobsData?.jobs.length === 0`, show a centered message: `"No open positions. Click 'Post Job' to get started."`.

**Loading state:** Show a skeleton list (3 rows of `<Skeleton className="h-14 w-full" />`).

---

## 4. Pipeline Board Rewrite

### 4.1 Stage Column Definition

Replace `const pipelineStages = ["Applied", "Screening", "Interview", "Offer", "Hired"]` with the router-aligned enum values:

```tsx
const PIPELINE_STAGES = ["SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];
```

Display labels: `{ SCREENING: "Screening", INTERVIEW: "Interview", OFFER: "Offer", HIRED: "Hired", REJECTED: "Rejected" }`.

### 4.2 Selected Job State

The pipeline board currently shows candidates from a hardcoded `candidates` array regardless of which job is selected. After wiring, the board must be **job-scoped**.

Add state:
```tsx
const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
```

When `jobsData` loads, auto-select the first job using a `useEffect` that fires when `jobsData` becomes defined:
```tsx
useEffect(() => {
  if (!selectedJobId && jobsData?.jobs[0]) {
    setSelectedJobId(jobsData.jobs[0].id);
  }
}, [jobsData, selectedJobId]);
```

Clicking a job row in the Open Positions list calls `setSelectedJobId(job.id)`.

### 4.3 Candidate Data Fetch

```tsx
const { data: candidatesData, isLoading: candidatesLoading } =
  trpc.hiring.listCandidates.useQuery(
    { jobId: selectedJobId!, limit: 100 },
    { enabled: selectedJobId !== null }
  );
```

`limit: 100` avoids pagination complexity in the initial wiring. This is acceptable for MVP.

### 4.4 Client-Side Bucketing

```tsx
// Use a concrete type for the bucket values — candidatesData may be undefined
// so we cannot use `typeof candidatesData.candidates` directly.
type CandidateItem = NonNullable<typeof candidatesData>['candidates'][number];

const candidatesByStage = useMemo(() => {
  const map: Record<PipelineStage, CandidateItem[]> = {
    SCREENING: [], INTERVIEW: [], OFFER: [], HIRED: [], REJECTED: [],
  };
  if (candidatesData?.candidates) {
    for (const c of candidatesData.candidates) {
      const stage = c.stage as PipelineStage;
      if (map[stage]) map[stage].push(c);
    }
  }
  return map;
}, [candidatesData]);
```

> **TypeScript note:** `typeof candidatesData.candidates` would fail to compile when `candidatesData` is `undefined` (the query's initial state). Always resolve the element type via `NonNullable<typeof candidatesData>['candidates'][number]` or define an explicit interface. If the tRPC inferred types are not accessible in the component file, fall back to `any[]` with a `// TODO: tighten type` comment rather than leaving the type error unresolved.

### 4.5 Candidate Card Display

Each candidate card shows:
- `${c.firstName} ${c.lastName}`
- `job.title` (from the selected job object)
- `c.rating ?? "—"` (optional star/number display)

**Empty column state:** "No candidates" message inside the column.

**Loading state:** Show a skeleton card placeholder per column while `candidatesLoading`.

### 4.6 Move Stage Button (minimal stub)

Each candidate card gets a "Move" dropdown or a simple "Advance" button that calls `trpc.hiring.moveStage.useMutation()`.

```tsx
const moveStage = trpc.hiring.moveStage.useMutation({
  onSuccess: () => utils.hiring.listCandidates.invalidate({ jobId: selectedJobId! }),
});
```

For the initial wiring, a simple inline button is sufficient — no drag-and-drop required.

---

## 5. CreateJob Modal

### 5.1 State

```tsx
const [showCreateJob, setShowCreateJob] = useState(false);
```

"Post Job" button sets `showCreateJob(true)`.

### 5.2 Form Fields (aligned with what the router persists)

Given the schema mismatch identified in §1.1, only collect fields that are actually written to the DB:

| Field | Input Type | Validation |
|---|---|---|
| `title` | text | required, min 1 |
| `description` | textarea | required, min 10 |
| `status` | select | `OPEN` / `CLOSED` / `ON_HOLD`, default `OPEN` |
| `salaryMin` | number | optional, positive |
| `salaryMax` | number | optional, positive |

Fields `department`, `location`, `jobType` are accepted by the router schema but silently dropped — **do not include them** until the router is fixed with `departmentId`/`siteId` lookups.

### 5.3 Mutation

```tsx
const createJob = trpc.hiring.createJob.useMutation({
  onSuccess: () => {
    utils.hiring.listJobs.invalidate();
    setShowCreateJob(false);
  },
});
```

### 5.4 Modal Implementation

Use a simple controlled `<dialog>` or a `<div>` overlay (no external modal library required). Pattern can follow the `add-employee-modal` component if it exists in the codebase. Keep it minimal: title, form fields, Submit and Cancel buttons.

---

## 6. AddCandidate Modal

### 6.1 Trigger

An "Add Candidate" button on each job row (or a button inside the pipeline board header when a job is selected).

```tsx
const [showAddCandidate, setShowAddCandidate] = useState(false);
```

### 6.2 Form Fields (aligned with `addCandidateSchema`)

| Field | Input | Notes |
|---|---|---|
| `firstName` | text | required |
| `lastName` | text | required |
| `email` | email | required |
| `phone` | tel | required (router enforces it) |
| `resume` | text/url | optional |
| `source` | select | `LINKEDIN / REFERRAL / WEBSITE / RECRUITER / OTHER`, default `OTHER` |

`jobId` is injected from `selectedJobId` — not a form field.

### 6.3 Mutation

```tsx
const addCandidate = trpc.hiring.addCandidate.useMutation({
  onSuccess: () => {
    utils.hiring.listCandidates.invalidate({ jobId: selectedJobId! });
    // Also invalidate listJobs to refresh _count.candidates
    utils.hiring.listJobs.invalidate();
    setShowAddCandidate(false);
  },
});
```

---

## 7. Router Fixes Required Before / Alongside Page Wiring

These changes must land in `src/server/routers/hiring.ts`:

### Fix A — `listJobs`: Add `department` and `site` includes

```ts
const jobs = await ctx.db.jobPosting.findMany({
  where,
  include: {
    _count: { select: { candidates: true } },
    department: { select: { name: true } },
    site: { select: { name: true } },
  },
  orderBy: { createdAt: 'desc' },
  take: limit + 1,
  ...(cursor && { skip: 1, cursor: { id: cursor } }),
});
```

### Fix B — `listJobs`: Remove invalid `department` string filter

Remove the line `if (department) where.department = department;` — `JobPosting` has no `department` string column. Either remove the `department` input from the schema or replace with `departmentId`.

### Fix C — `createJob`: Remove non-existent fields from schema

Remove `department`, `location`, `jobType` from `createJobSchema`, or keep them and document that they are not persisted (and do not add them to the `data` object without a migration). For the wiring task, **remove them from the schema** to avoid confusion.

Updated schema:
```ts
const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(10),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'ON_HOLD']).default('OPEN'),
});
```

---

## 8. Page Component Architecture

The rewritten `hiring/page.tsx` will be a single `"use client"` component with the following structure:

```
HiringPage
├── Header row (title + "Post Job" button)
├── Stat cards grid (4 cards: Open Positions, Total Candidates, Avg Time to Hire, Offers Accepted)
├── Open Positions card
│   └── Job list (click to select → updates pipeline)
│       └── [Add Candidate button per row]
├── Pipeline card
│   ├── Job selector context (selected job title shown)
│   └── Stage columns (SCREENING | INTERVIEW | OFFER | HIRED | REJECTED)
│       └── Candidate cards (name, rating, Move button stub)
├── CreateJobModal (conditional render when showCreateJob)
└── AddCandidateModal (conditional render when showAddCandidate)
```

Inline helper components (not extracted to separate files unless they exceed ~80 lines):
- `Skeleton({ className })` — matches analytics page pattern
- `formatRelative(date: Date): string` — e.g. "2 weeks ago"
- `STAGE_LABELS: Record<PipelineStage, string>`

---

## 9. TDD Execution Order

### Phase 1: Write RED Tests (nothing implemented yet)

#### 9.1 Router Unit Tests — `tests/unit/routers/hiring.router.test.ts`

Follow the exact pattern from `tests/unit/routers/analytics.router.test.ts`:
- `vi.mock('@/lib/db', ...)` with in-memory `db` object
- `vi.mock('@/server/trpc', ...)` stub that returns `protectedProcedure`
- Import `hiringRouter` and call `hiringRouter.createCaller(ctx)`

**16 test cases:**

| ID | Procedure | Scenario |
|---|---|---|
| H-1 | `listJobs` | Returns jobs for company filtered by `status: 'OPEN'` |
| H-2 | `listJobs` | Returns `_count.candidates` and `department.name`, `site.name` via includes (tests Fix A) |
| H-3 | `listJobs` | Returns empty array when no jobs exist |
| H-4 | `listJobs` | Cursor pagination: returns `nextCursor` when more items exist |
| H-5 | `createJob` | Creates job with required fields and returns created job |
| H-6 | `createJob` | Returns created job with `_count.candidates = 0` |
| H-7 | `listCandidates` | Returns candidates for a job |
| H-8 | `listCandidates` | Throws NOT_FOUND when jobId doesn't exist |
| H-9 | `listCandidates` | Throws FORBIDDEN when job belongs to different company |
| H-10 | `listCandidates` | Filters candidates by `stage` when provided |
| H-11 | `listCandidates` | Returns all candidates when no stage filter |
| H-12 | `addCandidate` | Creates candidate with `stage: 'SCREENING'` |
| H-13 | `addCandidate` | Throws NOT_FOUND when jobId doesn't exist |
| H-14 | `addCandidate` | Throws FORBIDDEN when job belongs to different company |
| H-15 | `moveStage` | Updates candidate stage and returns updated record |
| H-16 | `moveStage` | Throws NOT_FOUND when candidateId doesn't exist |

> **Note:** `moveStage` also has a FORBIDDEN path (line 87 of `hiring.ts`: `candidate.job.companyId !== ctx.user.companyId`). This is covered implicitly by the structural similarity to `addCandidate` — if desired, add H-17 as a FORBIDDEN case for `moveStage`. For the minimum 16, the cases above suffice because `addCandidate` (H-14) exercises the same guard pattern already tested for `listCandidates` (H-9).

**Mock setup for `listJobs` tests (after Fix A):**
```ts
const db = {
  jobPosting: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  candidate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};
```

`listJobs` mock return shape:
```ts
db.jobPosting.findMany.mockResolvedValue([{
  id: 'job-1', title: 'Frontend Engineer', status: 'OPEN',
  companyId: 'co-1', createdAt: new Date(),
  _count: { candidates: 5 },
  department: { name: 'Engineering' },
  site: { name: 'NYC' },
}]);
```

`createJob` mock return shape (for H-5 and H-6):
```ts
db.jobPosting.create.mockResolvedValue({
  id: 'job-2', title: 'Backend Engineer', description: 'Build APIs.',
  status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
  salaryMin: null, salaryMax: null,
  _count: { candidates: 0 },
});
```

#### 9.2 Component Tests — `tests/unit/components/hiring-page.test.tsx`

Follow the exact pattern from `tests/unit/components/analytics-page.test.tsx`:
- `vi.mock('@/lib/trpc', ...)` returning stub `trpc.hiring.*` hooks
- Mock `next-auth/react` `useSession`
- Mock `next/navigation`

**10 test cases:**

| ID | Scenario |
|---|---|
| C-1 | Open Positions stat card shows live job count, not hardcoded `8` |
| C-2 | Total Candidates stat card shows live sum, not hardcoded `73` |
| C-3 | Avg Time to Hire stat card shows `"N/A"` |
| C-4 | Offers Accepted stat card shows `"N/A"` |
| C-5 | Job list renders job titles from `listJobs` data, not hardcoded names |
| C-6 | Pipeline columns render for each stage (SCREENING, INTERVIEW, OFFER, HIRED, REJECTED) |
| C-7 | Candidate card shows `firstName + lastName` from `listCandidates` data |
| C-8 | Loading skeletons render when `listJobs` is loading |
| C-9 | Empty state renders when no jobs returned |
| C-10 | "Post Job" button click renders the CreateJob modal |

**Mock structure:**
```ts
// Default stub for useMutation — components destructure { mutate, isLoading }
const mutationStub = () => ({ mutate: vi.fn(), isLoading: false, isPending: false });

vi.mock('@/lib/trpc', () => ({
  trpc: {
    hiring: {
      listJobs: { useQuery: vi.fn() },
      listCandidates: { useQuery: vi.fn() },
      createJob: { useMutation: vi.fn(mutationStub) },
      addCandidate: { useMutation: vi.fn(mutationStub) },
      moveStage: { useMutation: vi.fn(mutationStub) },
    },
    useContext: vi.fn(() => ({
      hiring: {
        listJobs: { invalidate: vi.fn() },
        listCandidates: { invalidate: vi.fn() },
      },
    })),
  },
}));
```

> **`useMutation` mock return value:** The component calls `trpc.hiring.createJob.useMutation({ onSuccess: ... })` and then uses `createJob.mutate(data)`. If `useMutation` returns `undefined`, the component throws. Each `useMutation` vi.fn() **must** be initialized (via `mockReturnValue` in `beforeEach` or via the factory above) to return `{ mutate: vi.fn(), isLoading: false }`. Tests that need to simulate a pending/error state can override with `mockReturnValue` in the individual test.

Default mock data:
```ts
const mockJobs = [
  { id: 'job-1', title: 'Frontend Engineer', status: 'OPEN',
    department: { name: 'Engineering' }, site: { name: 'Remote' },
    _count: { candidates: 5 }, createdAt: new Date() },
];
const mockCandidates = [
  { id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'SCREENING',
    jobId: 'job-1', email: 'alice@example.com' },
];
```

Use a `setupDefaultMocks` helper (matching the analytics-page.test.tsx pattern) called from `beforeEach`:
```ts
import { trpc } from '@/lib/trpc';

function setupDefaultMocks() {
  vi.mocked(trpc.hiring.listJobs.useQuery).mockReturnValue({
    data: { jobs: mockJobs, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.hiring.listCandidates.useQuery).mockReturnValue({
    data: { candidates: mockCandidates, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.hiring.createJob.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
  vi.mocked(trpc.hiring.addCandidate.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
  vi.mocked(trpc.hiring.moveStage.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
}

beforeEach(() => { vi.clearAllMocks(); setupDefaultMocks(); });
```

> **C-7 and `selectedJobId` / `useEffect`:** The pipeline board only fetches candidates when `selectedJobId !== null`. `selectedJobId` starts as `null` and is set to the first job via `useEffect`. In jsdom (vitest + @testing-library/react), `useEffect` **does** fire during `render()`, so the auto-select will run synchronously enough to trigger a re-render and call `listCandidates.useQuery` with `enabled: true`. However, because `useQuery` is mocked (it never actually re-invokes with new args), the test must pre-configure `listCandidates.useQuery` to return candidate data for **any** call, regardless of input. The `enabled` flag is irrelevant to the vi.fn mock — the mock always returns whatever `.mockReturnValue` specifies. Therefore: set `listCandidates.useQuery.mockReturnValue({ data: { candidates: mockCandidates, nextCursor: undefined }, isLoading: false })` in `beforeEach` (or in C-7's test body), then `render(<HiringPage />)`, and assert that `"Alice Brown"` appears. No `act()` wrapper or `waitFor` is required because the mock returns synchronously.

### Phase 2: Implement to GREEN

**Order:**

1. **Fix router** (`src/server/routers/hiring.ts`):
   - Apply Fix A (add `department`/`site` includes to `listJobs`)
   - Apply Fix B (remove invalid `department` string filter)
   - Apply Fix C (remove `department`, `location`, `jobType` from `createJobSchema`)
   - Run router tests → H-1 through H-16 should pass

2. **Rewrite page** (`src/app/(dashboard)/hiring/page.tsx`):
   - Add tRPC hooks for `listJobs` and `listCandidates`
   - Replace stat card hardcoded values with derived values
   - Replace job list with `jobsData.jobs.map(...)` 
   - Add `selectedJobId` state and job row click handler
   - Replace pipeline `candidates.filter(c => c.stage === stage)` with `candidatesByStage[stage]`
   - Add loading skeletons and empty states
   - Run component tests → C-1 through C-10 should pass

3. **Add CreateJob modal** (inline in page or extracted to `src/components/hiring/create-job-modal.tsx`):
   - Controlled form with fields from Fix C's schema
   - `createJob.mutate(...)` on submit
   - C-10 should pass

4. **Add AddCandidate modal** (inline or `src/components/hiring/add-candidate-modal.tsx`):
   - Controlled form with `addCandidateSchema` fields
   - `addCandidate.mutate(...)` on submit

5. **Verify existing tests remain green:**
   - `tests/unit/services/hiring.test.ts` (38 tests) — these test pure functions only, no router/page changes touch them

---

## 10. Files Changed

| File | Action |
|---|---|
| `src/server/routers/hiring.ts` | Fix router (includes, schema cleanup) |
| `src/app/(dashboard)/hiring/page.tsx` | Full rewrite: remove hardcoded data, add tRPC hooks, modals, loading/empty states |
| `tests/unit/routers/hiring.router.test.ts` | **Create** — 16 router unit tests (RED first) |
| `tests/unit/components/hiring-page.test.tsx` | **Create** — 10 component tests (RED first) |

No new external dependencies required. All patterns follow established analytics page conventions.

---

## 11. Edge Cases and Notes

- **Pagination:** `listJobs` and `listCandidates` both paginate. For MVP wiring, call with `limit: 100` and do not implement infinite scroll. Add a `// TODO: implement pagination` comment.
- **`useContext` vs `useUtils`:** tRPC v10/v11 uses `trpc.useContext()` for cache invalidation. The mock must stub this correctly (see §9.2 mock structure).
- **Date formatting:** `job.createdAt` is a `Date` object. The page displays relative time (e.g., "2 weeks ago"). Add a simple `formatRelative` helper:
  ```ts
  function formatRelative(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 14) return "1 week ago";
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  }
  ```
- **`selected` job highlighting:** The selected job row in the Open Positions list should have a distinct background (e.g., `bg-indigo-50 border-indigo-200`) to indicate it is powering the pipeline board below.
- **Stage display mismatch with `hiring.test.ts`:** The service test (`hiring.test.ts`) uses an `APPLIED` stage and a `PHONE` stage that are not in the router's enum. These tests are pure function tests and are unaffected by the page wiring — do not modify `hiring.test.ts`.

---

## 12. Acceptance Criteria

- [ ] `tests/unit/routers/hiring.router.test.ts` — 16 tests pass
- [ ] `tests/unit/components/hiring-page.test.tsx` — 10 tests pass
- [ ] `tests/unit/services/hiring.test.ts` — 38 tests remain green (no regressions)
- [ ] `hiring/page.tsx` contains no hardcoded `jobs` or `candidates` arrays
- [ ] Stat cards read from `trpc.hiring.listJobs` response
- [ ] Pipeline board renders real candidates from `trpc.hiring.listCandidates`
- [ ] "Post Job" opens CreateJob modal wired to `createJob` mutation
- [ ] "Add Candidate" button wired to `addCandidate` mutation
- [ ] Loading skeletons shown while queries are in flight
- [ ] Empty states shown when no jobs or candidates returned
