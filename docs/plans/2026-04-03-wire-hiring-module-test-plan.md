# Test Plan: Wire Hiring Module

**Branch:** `wire-hiring-module`
**Date:** 2026-04-03
**Linked plan:** `2026-04-03-wire-hiring-module.md`
**Goal:** Validate that every hiring router procedure returns real, correctly shaped data (via mocked Prisma), that the hiring UI page contains no hardcoded values, and that all pre-existing tests remain green.

---

## Scope

Two new test files are created as part of the implementation, both following existing project conventions:

| File | Purpose |
|---|---|
| `tests/unit/routers/hiring.router.test.ts` | Router-level unit tests — mocked Prisma, no real DB |
| `tests/unit/components/hiring-page.test.tsx` | Component-level tests — mocked tRPC hooks, no real network |

The pre-existing file `tests/unit/services/hiring.test.ts` (38 pure-function tests) must remain green throughout; it is exercised as a regression guard.

---

## Harness Setup (both files)

### Router tests (`hiring.router.test.ts`)

```
Harness: vitest
DB mock: in-memory vi.fn() object injected as ctx.db
tRPC mock: vi.mock('@/server/trpc', ...) — same technique as analytics.router.test.ts
Caller: hiringRouter.createCaller(makeCtx())
```

The `db` mock object must expose:
- `db.jobPosting.findMany` — vi.fn()
- `db.jobPosting.findUnique` — vi.fn()
- `db.jobPosting.create` — vi.fn()
- `db.candidate.findMany` — vi.fn()
- `db.candidate.findUnique` — vi.fn()
- `db.candidate.create` — vi.fn()
- `db.candidate.update` — vi.fn()

The `makeCtx()` helper injects `{ db, user: { companyId: 'co-1', id: 'user-1', ... } }`.

```ts
const db = {
  jobPosting: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  candidate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

function makeCtx() {
  return {
    db: db as any,
    session: {
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
      expires: '',
    },
    user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
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
  return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure.use(isAuthed) };
});
```

### Component tests (`hiring-page.test.tsx`)

```
Harness: vitest + @testing-library/react
tRPC mock: vi.mock('@/lib/trpc', ...) — same technique as analytics-page.test.tsx
next-auth mock: vi.mock('next-auth/react', ...)
next/navigation mock: vi.mock('next/navigation', ...)
```

Full mock structure:

```ts
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

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/hiring',
}));
```

Standard mock data used across component tests:

```ts
const mockJobs = [
  {
    id: 'job-1',
    title: 'Frontend Engineer',
    status: 'OPEN',
    department: { name: 'Engineering' },
    site: { name: 'Remote' },
    _count: { candidates: 5 },
    createdAt: new Date('2026-03-10T00:00:00Z'),
  },
  {
    id: 'job-2',
    title: 'Backend Engineer',
    status: 'OPEN',
    department: { name: 'Engineering' },
    site: { name: 'NYC' },
    _count: { candidates: 3 },
    createdAt: new Date('2026-03-17T00:00:00Z'),
  },
];

const mockCandidates = [
  {
    id: 'c-1',
    firstName: 'Alice',
    lastName: 'Brown',
    stage: 'SCREENING',
    jobId: 'job-1',
    email: 'alice@example.com',
    phone: '555-1234',
    source: 'LINKEDIN',
    createdAt: new Date(),
  },
];
```

`setupDefaultMocks` helper called in `beforeEach`:

```ts
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

---

## Test Suite H — Router Unit Tests

File: `tests/unit/routers/hiring.router.test.ts`

> **Execution order note:** These tests are written BEFORE the router is fixed (RED phase), then go GREEN after the router fixes (Fix A, Fix B, Fix C) are applied.

---

### H-1: `listJobs` — returns jobs filtered by status for the caller's company

**Name:** listJobs returns jobs filtered by status: 'OPEN' for caller's company  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findMany resolves with:
[{
  id: 'job-1', title: 'Frontend Engineer', status: 'OPEN',
  companyId: 'co-1', createdAt: new Date(),
  _count: { candidates: 5 },
  department: { name: 'Engineering' },
  site: { name: 'NYC' },
}]
```

**Actions:**
```ts
const caller = hiringRouter.createCaller(makeCtx());
const result = await caller.listJobs({ status: 'OPEN', limit: 10 });
```

**Expected outcome:**
- `result.jobs` has length 1
- `result.jobs[0].title === 'Frontend Engineer'`
- `result.jobs[0].status === 'OPEN'`
- `db.jobPosting.findMany` was called with `where` containing `{ companyId: 'co-1', status: 'OPEN' }`
- `result.nextCursor` is `undefined`

---

### H-2: `listJobs` — response includes `_count.candidates`, `department.name`, and `site.name`

**Name:** listJobs returns jobs with candidate count and related department/site names (Fix A)  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findMany resolves with:
[{
  id: 'job-1', title: 'Frontend Engineer', status: 'OPEN',
  companyId: 'co-1', createdAt: new Date(),
  _count: { candidates: 5 },
  department: { name: 'Engineering' },
  site: { name: 'NYC' },
}]
```

**Actions:**
```ts
const result = await caller.listJobs({ limit: 10 });
```

**Expected outcome:**
- `result.jobs[0]._count.candidates === 5`
- `result.jobs[0].department.name === 'Engineering'`
- `result.jobs[0].site.name === 'NYC'`
- `db.jobPosting.findMany` was called with `include` containing `_count`, `department`, and `site` keys (verifying Fix A is applied)

---

### H-3: `listJobs` — returns empty array when no jobs exist

**Name:** listJobs returns empty jobs array when company has no job postings  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findMany resolves with: []
```

**Actions:**
```ts
const result = await caller.listJobs({ limit: 10 });
```

**Expected outcome:**
- `result.jobs` is `[]`
- `result.nextCursor` is `undefined`
- No exception thrown

---

### H-4: `listJobs` — cursor pagination returns `nextCursor` when more items exist

**Name:** listJobs returns nextCursor when result set exceeds the requested limit  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
limit = 2
db.jobPosting.findMany resolves with 3 items (limit + 1):
[
  { id: 'job-1', title: 'Job 1', status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
    _count: { candidates: 0 }, department: { name: 'Eng' }, site: { name: 'NYC' } },
  { id: 'job-2', title: 'Job 2', status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
    _count: { candidates: 0 }, department: { name: 'Eng' }, site: { name: 'NYC' } },
  { id: 'job-3', title: 'Job 3', status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
    _count: { candidates: 0 }, department: { name: 'Eng' }, site: { name: 'NYC' } },
]
```

**Actions:**
```ts
const result = await caller.listJobs({ limit: 2 });
```

**Expected outcome:**
- `result.jobs` has length 2 (the overflow item is removed)
- `result.nextCursor === 'job-3'` (the id of the popped item)

---

### H-5: `createJob` — creates job with required fields and returns the created record

**Name:** createJob creates a job posting with title, description, and status, returning the record  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.create resolves with:
{
  id: 'job-new', title: 'Backend Engineer', description: 'Build APIs for the platform.',
  status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
  salaryMin: null, salaryMax: null,
  _count: { candidates: 0 },
}
```

**Actions:**
```ts
const result = await caller.createJob({
  title: 'Backend Engineer',
  description: 'Build APIs for the platform.',
  status: 'OPEN',
});
```

**Expected outcome:**
- `result.id === 'job-new'`
- `result.title === 'Backend Engineer'`
- `result.status === 'OPEN'`
- `db.jobPosting.create` was called with `data` containing `{ title: 'Backend Engineer', companyId: 'co-1' }`
- The `data` object passed to `db.jobPosting.create` does NOT contain keys `department`, `location`, or `jobType` (verifying Fix C is applied)

---

### H-6: `createJob` — created job includes `_count.candidates` equal to zero

**Name:** createJob returns newly created job with _count.candidates of 0  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.create resolves with:
{
  id: 'job-new', title: 'QA Engineer', description: 'Ensure product quality always.',
  status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
  salaryMin: null, salaryMax: null,
  _count: { candidates: 0 },
}
```

**Actions:**
```ts
const result = await caller.createJob({
  title: 'QA Engineer',
  description: 'Ensure product quality always.',
  status: 'OPEN',
});
```

**Expected outcome:**
- `result._count.candidates === 0`
- `db.jobPosting.create` was called with `include: { _count: { select: { candidates: true } } }`

---

### H-7: `listCandidates` — returns candidates for an existing job owned by caller's company

**Name:** listCandidates returns all candidates for a job belonging to the caller's company  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with:
{ id: 'job-1', companyId: 'co-1', title: 'Frontend Engineer' }

db.candidate.findMany resolves with:
[
  { id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'SCREENING',
    jobId: 'job-1', email: 'alice@example.com', phone: '555-1234', createdAt: new Date() },
  { id: 'c-2', firstName: 'Bob', lastName: 'Smith', stage: 'INTERVIEW',
    jobId: 'job-1', email: 'bob@example.com', phone: '555-5678', createdAt: new Date() },
]
```

**Actions:**
```ts
const result = await caller.listCandidates({ jobId: 'job-1', limit: 10 });
```

**Expected outcome:**
- `result.candidates` has length 2
- `result.candidates[0].firstName === 'Alice'`
- `result.candidates[1].stage === 'INTERVIEW'`
- `result.nextCursor` is `undefined`
- `db.jobPosting.findUnique` was called with `where: { id: 'job-1' }`

---

### H-8: `listCandidates` — throws NOT_FOUND when jobId does not exist

**Name:** listCandidates throws NOT_FOUND TRPCError when the requested job does not exist  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with: null
```

**Actions:**
```ts
await expect(
  caller.listCandidates({ jobId: 'nonexistent-job', limit: 10 })
).rejects.toThrow(TRPCError);
```

**Expected outcome:**
- Throws `TRPCError` with `code: 'NOT_FOUND'`
- `db.candidate.findMany` is NOT called
- Error message contains "Job not found" or similar

---

### H-9: `listCandidates` — throws FORBIDDEN when job belongs to a different company

**Name:** listCandidates throws FORBIDDEN TRPCError when job is owned by a different company  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with:
{ id: 'job-other', companyId: 'co-2', title: 'Some Job' }
(ctx.user.companyId = 'co-1', which does not match 'co-2')
```

**Actions:**
```ts
await expect(
  caller.listCandidates({ jobId: 'job-other', limit: 10 })
).rejects.toThrow(TRPCError);
```

**Expected outcome:**
- Throws `TRPCError` with `code: 'FORBIDDEN'`
- `db.candidate.findMany` is NOT called

---

### H-10: `listCandidates` — filters candidates by `stage` when filter is provided

**Name:** listCandidates applies stage filter to the database query when stage is provided  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with:
{ id: 'job-1', companyId: 'co-1' }

db.candidate.findMany resolves with:
[
  { id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'INTERVIEW',
    jobId: 'job-1', email: 'alice@example.com', phone: '555-1234', createdAt: new Date() },
]
```

**Actions:**
```ts
const result = await caller.listCandidates({ jobId: 'job-1', stage: 'INTERVIEW', limit: 10 });
```

**Expected outcome:**
- `result.candidates` has length 1
- `result.candidates[0].stage === 'INTERVIEW'`
- `db.candidate.findMany` was called with `where` containing `{ jobId: 'job-1', stage: 'INTERVIEW' }`

---

### H-11: `listCandidates` — returns all candidates when no stage filter is provided

**Name:** listCandidates returns candidates in all stages when no stage filter is passed  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with:
{ id: 'job-1', companyId: 'co-1' }

db.candidate.findMany resolves with candidates in mixed stages:
[
  { id: 'c-1', stage: 'SCREENING', jobId: 'job-1', firstName: 'Alice', lastName: 'Brown',
    email: 'alice@example.com', phone: '555-1234', createdAt: new Date() },
  { id: 'c-2', stage: 'OFFER', jobId: 'job-1', firstName: 'Carol', lastName: 'White',
    email: 'carol@example.com', phone: '555-9999', createdAt: new Date() },
]
```

**Actions:**
```ts
const result = await caller.listCandidates({ jobId: 'job-1', limit: 10 });
// (no stage argument)
```

**Expected outcome:**
- `result.candidates` has length 2
- `db.candidate.findMany` was called with `where` equal to `{ jobId: 'job-1' }` (no `stage` key)

---

### H-12: `addCandidate` — creates candidate with stage set to 'SCREENING'

**Name:** addCandidate creates a new candidate with stage defaulting to 'SCREENING'  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with:
{ id: 'job-1', companyId: 'co-1' }

db.candidate.create resolves with:
{
  id: 'c-new', firstName: 'Dave', lastName: 'Jones',
  email: 'dave@example.com', phone: '555-0001',
  jobId: 'job-1', stage: 'SCREENING', source: 'LINKEDIN',
  resume: null, createdAt: new Date(),
}
```

**Actions:**
```ts
const result = await caller.addCandidate({
  jobId: 'job-1',
  firstName: 'Dave',
  lastName: 'Jones',
  email: 'dave@example.com',
  phone: '555-0001',
  source: 'LINKEDIN',
});
```

**Expected outcome:**
- `result.stage === 'SCREENING'`
- `result.firstName === 'Dave'`
- `db.candidate.create` was called with `data` containing `{ stage: 'SCREENING', jobId: 'job-1' }`

---

### H-13: `addCandidate` — throws NOT_FOUND when jobId does not exist

**Name:** addCandidate throws NOT_FOUND TRPCError when the target job does not exist  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with: null
```

**Actions:**
```ts
await expect(
  caller.addCandidate({
    jobId: 'nonexistent-job',
    firstName: 'Dave', lastName: 'Jones',
    email: 'dave@example.com', phone: '555-0001',
    source: 'OTHER',
  })
).rejects.toThrow(TRPCError);
```

**Expected outcome:**
- Throws `TRPCError` with `code: 'NOT_FOUND'`
- `db.candidate.create` is NOT called

---

### H-14: `addCandidate` — throws FORBIDDEN when job belongs to a different company

**Name:** addCandidate throws FORBIDDEN TRPCError when job is owned by a different company  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.jobPosting.findUnique resolves with:
{ id: 'job-other', companyId: 'co-2' }
(ctx.user.companyId = 'co-1')
```

**Actions:**
```ts
await expect(
  caller.addCandidate({
    jobId: 'job-other',
    firstName: 'Dave', lastName: 'Jones',
    email: 'dave@example.com', phone: '555-0001',
    source: 'OTHER',
  })
).rejects.toThrow(TRPCError);
```

**Expected outcome:**
- Throws `TRPCError` with `code: 'FORBIDDEN'`
- `db.candidate.create` is NOT called

---

### H-15: `moveStage` — updates candidate stage and returns the updated record

**Name:** moveStage updates candidate stage to the provided value and returns the updated record  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.candidate.findUnique resolves with:
{
  id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'SCREENING',
  jobId: 'job-1',
  job: { id: 'job-1', companyId: 'co-1' },
}

db.candidate.update resolves with:
{
  id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'INTERVIEW',
  jobId: 'job-1',
}
```

**Actions:**
```ts
const result = await caller.moveStage({ candidateId: 'c-1', stage: 'INTERVIEW' });
```

**Expected outcome:**
- `result.stage === 'INTERVIEW'`
- `db.candidate.findUnique` was called with `where: { id: 'c-1' }` and `include: { job: true }`
- `db.candidate.update` was called with `where: { id: 'c-1' }` and `data: { stage: 'INTERVIEW' }`

---

### H-16: `moveStage` — throws NOT_FOUND when candidateId does not exist

**Name:** moveStage throws NOT_FOUND TRPCError when the candidate does not exist  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.candidate.findUnique resolves with: null
```

**Actions:**
```ts
await expect(
  caller.moveStage({ candidateId: 'nonexistent-candidate', stage: 'INTERVIEW' })
).rejects.toThrow(TRPCError);
```

**Expected outcome:**
- Throws `TRPCError` with `code: 'NOT_FOUND'`
- `db.candidate.update` is NOT called
- Error message contains "Candidate not found" or similar

---

## Test Suite C — Component Tests

File: `tests/unit/components/hiring-page.test.tsx`

> **Execution order note:** These tests are written BEFORE the page is rewritten (RED phase), then go GREEN after the page rewrite is applied.

All tests use `setupDefaultMocks()` in `beforeEach` to configure the tRPC mock hooks with `mockJobs` and `mockCandidates` data.

---

### C-1: Open Positions stat card shows live job count, not hardcoded 8

**Name:** Open Positions stat card displays count derived from listJobs data, not hardcoded 8  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.hiring.listJobs.useQuery returns:
{
  data: { jobs: mockJobs, nextCursor: undefined },
  isLoading: false, error: null,
}
(mockJobs has 2 OPEN jobs, so openPositions count = 2)
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- `screen.getByText('2')` is found (count of OPEN jobs from live data)
- `screen.queryByText('8')` returns null (hardcoded value is gone)

---

### C-2: Total Candidates stat card shows live sum, not hardcoded 73

**Name:** Total Candidates stat card displays sum of _count.candidates from listJobs data, not hardcoded 73  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.hiring.listJobs.useQuery returns mockJobs:
- job-1: _count.candidates = 5
- job-2: _count.candidates = 3
Total = 8
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- `screen.getByText('8')` is found (sum of candidates across all jobs)
- `screen.queryByText('73')` returns null (hardcoded value is gone)

---

### C-3: Avg Time to Hire stat card shows "N/A"

**Name:** Avg Time to Hire stat card shows N/A because no dedicated procedure exists  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
Default mocks active (setupDefaultMocks)
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- The page contains the text `'N/A'` in the Avg Time to Hire card region
- `screen.queryByText('23d')` returns null (hardcoded value is gone)

---

### C-4: Offers Accepted stat card shows "N/A"

**Name:** Offers Accepted stat card shows N/A because no aggregate endpoint exists  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
Default mocks active (setupDefaultMocks)
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- The count of N/A occurrences on the page is at least 1 (covers both Avg Time to Hire and Offers Accepted)
- `screen.queryByText('3')` as a standalone stat value returns null (hardcoded Offers Accepted value is gone)

---

### C-5: Job list renders job titles from `listJobs` data, not hardcoded names

**Name:** Open Positions list renders live job titles from listJobs response, not hardcoded names  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.hiring.listJobs.useQuery returns mockJobs with titles:
- 'Frontend Engineer'
- 'Backend Engineer'
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- `screen.getByText('Frontend Engineer')` is found
- `screen.getByText('Backend Engineer')` is found
- `screen.queryByText('Senior Frontend Engineer')` returns null (hardcoded job title from current page.tsx is gone)
- `screen.queryByText('Product Designer')` returns null (another hardcoded job title is gone)

---

### C-6: Pipeline columns render for each expected stage

**Name:** Pipeline board renders a column for each of the five router-aligned stages  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
Default mocks active (setupDefaultMocks)
Expected stages: SCREENING, INTERVIEW, OFFER, HIRED, REJECTED
(Display labels: Screening, Interview, Offer, Hired, Rejected)
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- `screen.getByText('Screening')` is found
- `screen.getByText('Interview')` is found
- `screen.getByText('Offer')` is found
- `screen.getByText('Hired')` is found
- `screen.getByText('Rejected')` is found
- `screen.queryByText('Applied')` returns null (old hardcoded stage that was removed)

---

### C-7: Candidate card shows firstName and lastName from `listCandidates` data

**Name:** Pipeline candidate card displays real firstName + lastName from listCandidates, not hardcoded names  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.hiring.listCandidates.useQuery returns:
{
  data: { candidates: mockCandidates, nextCursor: undefined },
  isLoading: false, error: null,
}
mockCandidates[0]: { firstName: 'Alice', lastName: 'Brown', stage: 'SCREENING' }

Note: listCandidates.useQuery must be pre-configured to return data regardless of
input args, because the enabled flag on the mock is irrelevant. The useEffect
auto-selecting the first job fires synchronously in jsdom and triggers a re-render.
No act() or waitFor is needed because the mock returns synchronously.
```

**Actions:**
```ts
render(<HiringPage />);
```

**Expected outcome:**
- `screen.getByText('Alice Brown')` (or equivalent combined name display) is found in the DOM
- `screen.queryByText('Alice Brown')` does not throw (the candidate card is rendered inside the SCREENING column)
- `screen.queryByText('Bob Martinez')` returns null (hardcoded candidate name from current page.tsx is gone)
- `screen.queryByText('Carol White')` returns null (another hardcoded candidate name is gone)

---

### C-8: Loading skeletons render when `listJobs` is loading

**Name:** Hiring page renders skeleton loading states when listJobs query is in flight  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.hiring.listJobs.useQuery returns:
{ data: undefined, isLoading: true, error: null }
All mutation mocks return their default stubs (from setupDefaultMocks).
```

**Actions:**
```ts
vi.mocked(trpc.hiring.listJobs.useQuery).mockReturnValue({
  data: undefined, isLoading: true, error: null,
} as any);
render(<HiringPage />);
```

**Expected outcome:**
- At least one skeleton element is rendered (element matching `.animate-pulse`, `[data-testid="skeleton"]`, or `[role="status"]`)
- `screen.queryByText('Frontend Engineer')` returns null (job list is not rendered while loading)
- The hardcoded value `'8'` for Open Positions is not rendered

---

### C-9: Empty state renders when no jobs are returned

**Name:** Hiring page shows empty state message when listJobs returns an empty jobs array  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.hiring.listJobs.useQuery returns:
{ data: { jobs: [], nextCursor: undefined }, isLoading: false, error: null }
```

**Actions:**
```ts
vi.mocked(trpc.hiring.listJobs.useQuery).mockReturnValue({
  data: { jobs: [], nextCursor: undefined }, isLoading: false, error: null,
} as any);
render(<HiringPage />);
```

**Expected outcome:**
- An empty-state message is visible (e.g. matching `/no open positions/i` or `/post job/i` within an empty-state element)
- `screen.queryByText('Frontend Engineer')` returns null (no job list items)
- Open Positions stat card shows `'0'`

---

### C-10: "Post Job" button click renders the CreateJob modal

**Name:** Clicking the Post Job button causes the CreateJob modal to appear in the DOM  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
Default mocks active (setupDefaultMocks)
userEvent or fireEvent is available
```

**Actions:**
```ts
render(<HiringPage />);
const postJobButton = screen.getByRole('button', { name: /post job/i });
fireEvent.click(postJobButton);
```

**Expected outcome:**
- After the click, a modal or dialog is present in the DOM
- The modal contains a form field for `title` (e.g. `screen.getByLabelText(/title/i)` or `screen.getByPlaceholderText(/job title/i)`)
- The modal contains a Submit or "Create" button
- The modal does NOT contain inputs for `department`, `location`, or `jobType` (these were removed per Fix C)

---

## Test Suite R — Regression Tests

### R-1: Existing hiring service tests remain green

**Name:** All 38 tests in `tests/unit/services/hiring.test.ts` continue to pass  
**Type:** regression  
**Harness:** vitest (existing file, no modifications)

**Preconditions:**
- `tests/unit/services/hiring.test.ts` is NOT modified during the implementation
- The pure functions under test (`validateStageTransition`, `moveCandidate`, `calculateCandidateScore`, `aggregateInterviewScores`, `evaluateCandidateQuality`, `createCandidate`) are NOT modified

**Actions:**
```
npx vitest run tests/unit/services/hiring.test.ts
```

**Expected outcome:**
- All 38 tests pass
- Exit code 0
- Note: `hiring.test.ts` uses stages `APPLIED` and `PHONE` that are not in the router's enum — this is intentional and must remain unaffected

---

### R-2: Full test suite remains green

**Name:** All 213 pre-existing passing tests remain green after all implementation tasks  
**Type:** regression  
**Harness:** vitest

**Preconditions:**
- Router fixes, page rewrite, and both new test files are in place
- No pre-existing test file is modified

**Actions:**
```
npx vitest run
```

**Expected outcome:**
- 213 + 26 new tests (16 router + 10 component) pass
- Exit code 0

---

### R-3: TypeScript compilation succeeds

**Name:** No TypeScript errors introduced by hiring router fixes or page rewrite  
**Type:** regression  
**Harness:** tsc

**Actions:**
```
npx tsc --noEmit
```

**Expected outcome:**
- Exit code 0
- No unresolved type errors in `src/server/routers/hiring.ts` or `src/app/(dashboard)/hiring/page.tsx`
- The `CandidateItem` type is resolved via `NonNullable<typeof candidatesData>['candidates'][number]` (or equivalent) — not left as unresolved `undefined`

---

## Test Inventory Summary

| ID | Suite | Name | Type |
|---|---|---|---|
| H-1 | Router | listJobs returns OPEN jobs for caller's company | unit |
| H-2 | Router | listJobs response includes _count, department.name, site.name | unit |
| H-3 | Router | listJobs returns empty array when company has no jobs | unit |
| H-4 | Router | listJobs returns nextCursor when result exceeds limit | unit |
| H-5 | Router | createJob creates job with required fields and returns record | unit |
| H-6 | Router | createJob returns job with _count.candidates = 0 | unit |
| H-7 | Router | listCandidates returns candidates for a valid job | unit |
| H-8 | Router | listCandidates throws NOT_FOUND for nonexistent job | unit |
| H-9 | Router | listCandidates throws FORBIDDEN for cross-company job | unit |
| H-10 | Router | listCandidates applies stage filter to DB query | unit |
| H-11 | Router | listCandidates returns all stages when no filter is provided | unit |
| H-12 | Router | addCandidate creates candidate with stage SCREENING | unit |
| H-13 | Router | addCandidate throws NOT_FOUND for nonexistent job | unit |
| H-14 | Router | addCandidate throws FORBIDDEN for cross-company job | unit |
| H-15 | Router | moveStage updates candidate stage and returns updated record | unit |
| H-16 | Router | moveStage throws NOT_FOUND for nonexistent candidate | unit |
| C-1 | Component | Open Positions shows live count not hardcoded 8 | unit |
| C-2 | Component | Total Candidates shows live sum not hardcoded 73 | unit |
| C-3 | Component | Avg Time to Hire shows N/A | unit |
| C-4 | Component | Offers Accepted shows N/A | unit |
| C-5 | Component | Job list renders live titles not hardcoded names | unit |
| C-6 | Component | Pipeline renders column for each of 5 stages | unit |
| C-7 | Component | Candidate card shows firstName + lastName from listCandidates | unit |
| C-8 | Component | Loading skeletons render when listJobs is loading | unit |
| C-9 | Component | Empty state renders when no jobs returned | unit |
| C-10 | Component | Post Job button click renders CreateJob modal | unit |
| R-1 | Regression | hiring.test.ts 38 pure-function tests remain green | regression |
| R-2 | Regression | Full suite (213 + new) passes | regression |
| R-3 | Regression | TypeScript compiles with no errors | regression |

**Total: 29 test specifications across 3 suites**

---

## Execution Order

Mirrors the implementation plan's Phase 1 / Phase 2 discipline:

1. **Write Suite H tests** (H-1 through H-16) — tests are RED against the current buggy router
2. **Apply router fixes** (Fix A: add includes, Fix B: remove invalid department filter, Fix C: remove non-persisted fields from schema) — Suite H goes GREEN
3. **Write Suite C tests** (C-1 through C-10) — tests are RED against the current hardcoded page
4. **Rewrite hiring page** (add tRPC hooks, stat card derivation, job list, pipeline, modals, loading/empty states) — Suite C goes GREEN
5. **Run Suite R** (R-1 through R-3) — verify all pre-existing tests still pass and TypeScript is clean

---

## Key Implementation Constraints Verified by Tests

| Constraint | Verified by |
|---|---|
| `listJobs` includes `department` and `site` relations (Fix A) | H-2 |
| `listJobs` does not use invalid `department` string filter (Fix B) | H-1 (where clause assertion) |
| `createJob` schema no longer accepts `department`, `location`, `jobType` (Fix C) | H-5 (data object assertion), C-10 (modal has no removed fields) |
| Stat cards read from live tRPC data | C-1, C-2 |
| Stat cards show N/A for unimplemented metrics | C-3, C-4 |
| Pipeline uses router-aligned stage enum, not hardcoded "Applied" | C-6 |
| Candidate display uses real name fields | C-7 |
| Company isolation enforced on all write/read operations | H-9, H-14 |
| `addCandidate` always sets `stage: 'SCREENING'` | H-12 |
| Existing pure-function tests unaffected | R-1 |
