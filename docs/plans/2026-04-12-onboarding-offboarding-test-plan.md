# Onboarding & Offboarding Redesign — Test Plan

**Feature:** Onboarding & Offboarding Redesign  
**Implementation plan:** `docs/plans/2026-04-12-onboarding-offboarding-redesign.md`  
**Branch:** `add-onboarding-offboarding`  
**Date:** 2026-04-12  
**Test framework:** Vitest + Testing Library (existing harness, no new setup required)

---

## Overview

This test plan covers all automated checks required for the Onboarding & Offboarding redesign. Tests are ordered by priority:

1. **RED→GREEN regression gates** — existing tests that will break because of interface changes and must be fixed before new code lands
2. **O-1 through O-7** — new tRPC router procedure tests
3. **C-1 through C-5** — new component/page tests for the two-tab redesign
4. **Stale test cleanup** — old card-based component tests that must be removed or replaced

No new test harnesses or infrastructure are required. The existing `vi.mock` + `mockResolvedValue` pattern for routers and the `vi.mock('@/lib/trpc', ...)` + `QueryClientProvider` wrapper pattern for components are reused throughout.

---

## Priority 1 — RED→GREEN Regression Gates (existing tests that will break)

These tests exist today and will fail the moment Task 3 (router) and Task 7 (page rewrite) land. They must be updated as part of those tasks, not after.

### R-1: `myTasks` status filter update

**File:** `tests/unit/routers/onboarding.router.test.ts`  
**Current assertion (line 35):**
```typescript
expect(prisma.onboardingTask.findMany).toHaveBeenCalledWith({
  where: { assigneeId: 'user-1', status: 'PENDING' },
});
```
**Required update:** Change `status: 'PENDING'` to `status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }` to match the new router behavior.

**Why it breaks:** The new `myTasks` procedure uses `status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }` because `PENDING` is no longer a valid status value.

**Pass condition:** `expect(prisma.onboardingTask.findMany).toHaveBeenCalledWith({ where: { assigneeId: 'user-1', status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } })` passes.

---

### R-2: `createTask` no longer accepts `assigneeType`

**File:** `tests/unit/routers/onboarding.router.test.ts`  
**Current input (line 50):**
```typescript
const input = {
  employeeId: 'emp-1',
  title: 'Manual Task',
  assigneeType: 'HR',
  assigneeId: 'admin-1'
};
```
**Required update:** Remove `assigneeType: 'HR'` from the input object. The new router's `createTask` zod schema does not include `assigneeType` (the field was removed from the `OnboardingTask` schema in Task 1).

**Pass condition:** The test still asserts `result.title === 'Manual Task'` and `prisma.onboardingTask.create` was called — the same semantics, just without the removed field in the input.

---

### R-3: `listNewHires` include shape changed

**File:** `tests/unit/routers/onboarding.router.test.ts`  
**Current assertion (lines 165–173):**
```typescript
expect(prisma.employee.findMany).toHaveBeenCalledWith({
  where: { 
    companyId: 'company-1',
    status: 'ACTIVE'
  },
  include: {
    onboardingTasks: true
  }
});
```
**Required update:** The new `listNewHires` procedure uses an expanded include with `orderBy`, nested `assignee` select, and `department` select. Update the assertion to use `expect.objectContaining` so it does not brittle-fail on additional fields:
```typescript
expect(prisma.employee.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { companyId: 'company-1', status: 'ACTIVE' },
  })
);
```

**Pass condition:** The test passes with the looser `expect.objectContaining` matcher.

---

### R-4: vi.mock must include `offboardingTask` and `onboardingTask.update`

**File:** `tests/unit/routers/onboarding.router.test.ts`  
**Required update:** Replace the top-level `vi.mock` block with the expanded version that includes all new Prisma methods:
```typescript
vi.mock('../../../src/lib/db', () => ({
  prisma: {
    onboardingTask: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),  // NEW
    },
    offboardingTask: {  // NEW
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    onboardingTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    }
  },
}));
```

**Pass condition:** All 19 tests (9 existing + 10 new) can resolve their mock methods without `undefined is not a function` errors.

---

## Priority 2 — New Router Tests (O-1 through O-7)

All tests go in `tests/unit/routers/onboarding.router.test.ts` in new `describe` blocks after the existing ones.

### O-1: `getChecklist` returns tasks grouped by section

```typescript
describe('Onboarding Router - getChecklist', () => {
  it('O-1: getChecklist returns tasks for employee, grouped by section', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTask.findMany as any).mockResolvedValue([
      { id: 't1', section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Task 1', status: 'DONE', dueDate: null, notes: null, sortOrder: 1, assignee: null },
      { id: 't2', section: 'First day', sectionType: 'GENERAL', title: 'Task 2', status: 'NOT_STARTED', dueDate: null, notes: null, sortOrder: 1, assignee: null },
    ]);

    const result = await caller.onboarding.getChecklist({ employeeId: 'emp-1' });
    expect(result).toHaveLength(2);
    const sections = result.map((s: any) => s.section);
    expect(sections).toContain('Pre-arrival');
    expect(sections).toContain('First day');
  });
```

**Pass condition:** Result has 2 section groups with the correct section names.

---

### O-2: `getChecklist` groups tasks by section correctly

```typescript
  it('O-2: getChecklist groups tasks by section correctly', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTask.findMany as any).mockResolvedValue([
      { id: 't1', section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Task A', status: 'DONE', dueDate: null, notes: null, sortOrder: 1, assignee: null },
      { id: 't2', section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Task B', status: 'NOT_STARTED', dueDate: null, notes: null, sortOrder: 2, assignee: null },
      { id: 't3', section: 'DevOps', sectionType: 'DEVOPS', title: 'AWS setup', status: 'NOT_STARTED', dueDate: null, notes: null, sortOrder: 1, assignee: null },
    ]);

    const result = await caller.onboarding.getChecklist({ employeeId: 'emp-1' });
    const preArrival = result.find((s: any) => s.section === 'Pre-arrival');
    expect(preArrival?.tasks).toHaveLength(2);
    const devops = result.find((s: any) => s.section === 'DevOps');
    expect(devops?.tasks).toHaveLength(1);
  });
});
```

**Pass condition:** Pre-arrival section has 2 tasks; DevOps section has 1 task.

---

### O-3: `getChecklist` throws FORBIDDEN for employee in another company

```typescript
  it('O-3: getChecklist throws FORBIDDEN for employee in another company', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);
    (prisma.employee.findFirst as any).mockResolvedValue(null);

    await expect(
      caller.onboarding.getChecklist({ employeeId: 'emp-other' })
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
```

**Pass condition:** Rejects with `TRPCError` with `code: 'FORBIDDEN'`.

---

### O-4: `updateTaskStatus` persists the new status

```typescript
describe('Onboarding Router - updateTaskStatus', () => {
  it('O-4: updateTaskStatus persists the new status', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.onboardingTask.update as any).mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });

    const result = await caller.onboarding.updateTaskStatus({ taskId: 't1', status: 'IN_PROGRESS' });
    expect(result.status).toBe('IN_PROGRESS');
    expect(prisma.onboardingTask.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    });
  });
});
```

**Pass condition:** Returns updated task with new status; `prisma.onboardingTask.update` was called with correct args.

---

### O-5: `startOffboarding` creates offboarding tasks for the employee

```typescript
describe('Onboarding Router - Offboarding', () => {
  it('O-5: startOffboarding creates offboarding tasks for the employee', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.offboardingTask.createMany as any).mockResolvedValue({ count: 5 });

    const result = await caller.onboarding.startOffboarding({ employeeId: 'emp-1' });
    expect(result.count).toBeGreaterThan(0);
    expect(prisma.offboardingTask.createMany).toHaveBeenCalled();
  });
```

**Pass condition:** Returns `{ count: N }` where N > 0; `prisma.offboardingTask.createMany` was called.

---

### O-6: `updateOffboardingTaskStatus` persists the new status

```typescript
  it('O-6: updateOffboardingTaskStatus persists the new status', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.offboardingTask.update as any).mockResolvedValue({ id: 'ot1', status: 'DONE' });

    const result = await caller.onboarding.updateOffboardingTaskStatus({ taskId: 'ot1', status: 'DONE' });
    expect(result.status).toBe('DONE');
  });
```

**Pass condition:** Returns `{ id: 'ot1', status: 'DONE' }`.

---

### O-7: `listOffboarding` returns only TERMINATED employees with company isolation

```typescript
  it('O-7: listOffboarding returns only TERMINATED employees with company isolation', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findMany as any).mockResolvedValue([
      { id: 'emp-term', firstName: 'John', lastName: 'Doe', status: 'TERMINATED', offboardingTasks: [] }
    ]);

    const result = await caller.onboarding.listOffboarding();
    expect(result).toHaveLength(1);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'company-1', status: 'TERMINATED' }),
    }));
  });
});
```

**Pass condition:** Returns 1 employee; `findMany` was called with `companyId: 'company-1'` and `status: 'TERMINATED'`.

---

## Priority 3 — New Component Tests (C-1 through C-5)

**File:** `tests/unit/components/onboarding-page.test.tsx`

### Mock setup (replace existing mock block)

The existing mock covers only `listNewHires`. Replace it with the expanded mock that covers all new procedures and mocks `EmployeeChecklistRow` to avoid testing its internals:

```typescript
vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      listNewHires: { useQuery: vi.fn() },
      listOffboarding: { useQuery: vi.fn() },
      getChecklist: { useQuery: vi.fn() },
      getOffboardingChecklist: { useQuery: vi.fn() },
      updateTaskStatus: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
      updateOffboardingTaskStatus: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
      startOffboarding: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })) },
    },
    useUtils: vi.fn(() => ({
      onboarding: {
        listNewHires: { invalidate: vi.fn() },
        listOffboarding: { invalidate: vi.fn() },
        getChecklist: { invalidate: vi.fn() },
        getOffboardingChecklist: { invalidate: vi.fn() },
      },
    })),
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    createClient: vi.fn(() => ({})),
  },
}));

vi.mock('@/components/onboarding/employee-checklist-row', () => ({
  EmployeeChecklistRow: ({ employee, mode }: { employee: any; mode: string }) => (
    <div data-testid={`employee-row-${mode}-${employee.id}`}>{employee.firstName} {employee.lastName}</div>
  ),
}));
```

### Shared test data

```typescript
const mockNewHires = [
  {
    id: 'emp-1', firstName: 'Alice', lastName: 'Smith',
    startDate: new Date('2026-03-01'), status: 'ACTIVE',
    department: { id: 'd1', name: 'Engineering' },
    avatar: null,
    onboardingTasks: [
      { id: 't1', status: 'DONE' },
      { id: 't2', status: 'NOT_STARTED' },
    ],
  },
];
const mockOffboarding = [
  {
    id: 'emp-term', firstName: 'Bob', lastName: 'Jones',
    startDate: new Date('2024-01-01'), endDate: new Date('2026-03-15'), status: 'TERMINATED',
    department: { id: 'd2', name: 'Sales' },
    avatar: null,
    offboardingTasks: [{ id: 'ot1', status: 'NOT_STARTED' }],
  },
];
```

---

### C-1: Onboarding tab is active by default and shows employee rows

```typescript
describe('OnboardingPage - new design', () => {
  it('C-1: shows onboarding tab active by default with employee rows', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: mockNewHires, isLoading: false } as any);
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);

    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByRole('tab', { name: /onboarding/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /offboarding/i })).toBeInTheDocument();
    expect(screen.getByTestId('employee-row-onboarding-emp-1')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });
```

**Pass condition:** Both tabs rendered; onboarding employee row visible.

---

### C-2: Switching to Offboarding tab shows terminated employees

```typescript
  it('C-2: switching to Offboarding tab shows terminated employees', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: mockNewHires, isLoading: false } as any);
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: mockOffboarding, isLoading: false } as any);

    render(<OnboardingPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /offboarding/i }));

    expect(screen.getByTestId('employee-row-offboarding-emp-term')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });
```

**Pass condition:** After tab click, offboarding employee row is visible.

---

### C-3: Empty state on Offboarding tab when no terminated employees

```typescript
  it('C-3: shows empty state on offboarding tab when no terminated employees', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);

    render(<OnboardingPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /offboarding/i }));

    expect(screen.getByText(/no employees being offboarded/i)).toBeInTheDocument();
  });
```

**Pass condition:** Empty-state message visible after switching to Offboarding tab.

---

### C-4: DevOps section visible for Engineering employees, hidden for others

This test targets `EmployeeChecklistRow` directly (not mocked), rendering it with a `ChecklistTable` that contains DEVOPS-typed sections.

**File:** `tests/unit/components/employee-checklist-row.test.tsx` (new file)

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { EmployeeChecklistRow } from '@/components/onboarding/employee-checklist-row';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      getChecklist: {
        useQuery: vi.fn(),
      },
      getOffboardingChecklist: {
        useQuery: vi.fn(),
      },
      updateTaskStatus: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
      updateOffboardingTaskStatus: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isLoading: false })),
      },
    },
    useUtils: vi.fn(() => ({
      onboarding: {
        listNewHires: { invalidate: vi.fn() },
        listOffboarding: { invalidate: vi.fn() },
        getChecklist: { invalidate: vi.fn() },
        getOffboardingChecklist: { invalidate: vi.fn() },
      },
    })),
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    createClient: vi.fn(() => ({})),
  },
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const mockTrpcClient = trpc.createClient({} as any);

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <trpc.Provider client={mockTrpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </trpc.Provider>
);

const mockEmployee = {
  id: 'emp-1',
  firstName: 'Alice',
  lastName: 'Smith',
  avatar: null,
  startDate: new Date('2026-03-01'),
  department: { name: 'Engineering' },
  onboardingTasks: [
    { id: 't1', status: 'DONE' },
    { id: 't2', status: 'NOT_STARTED' },
  ],
};

const mockSections = [
  {
    section: 'Pre-arrival',
    sectionType: 'GENERAL',
    tasks: [{ id: 't1', title: 'General task', status: 'DONE', dueDate: null, notes: null, assignee: null }],
  },
  {
    section: 'DevOps',
    sectionType: 'DEVOPS',
    tasks: [{ id: 't2', title: 'AWS setup', status: 'NOT_STARTED', dueDate: null, notes: null, assignee: null }],
  },
];

describe('EmployeeChecklistRow - DevOps section visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('C-4a: DevOps section is visible for Engineering employees (isDevOps=true)', async () => {
    vi.mocked(trpc.onboarding.getChecklist.useQuery).mockReturnValue({
      data: mockSections,
      isLoading: false,
    } as any);

    render(
      <EmployeeChecklistRow employee={mockEmployee as any} mode="onboarding" isDevOps={true} />,
      { wrapper: Wrapper }
    );

    // Expand the row
    fireEvent.click(screen.getByRole('button', { name: /alice smith/i }));

    expect(screen.getByTestId('section-DevOps')).toBeInTheDocument();
    expect(screen.getByText('AWS setup')).toBeInTheDocument();
  });

  it('C-4b: DevOps section is hidden for non-Engineering employees (isDevOps=false)', async () => {
    vi.mocked(trpc.onboarding.getChecklist.useQuery).mockReturnValue({
      data: mockSections,
      isLoading: false,
    } as any);

    render(
      <EmployeeChecklistRow employee={mockEmployee as any} mode="onboarding" isDevOps={false} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: /alice smith/i }));

    expect(screen.queryByTestId('section-DevOps')).not.toBeInTheDocument();
    expect(screen.queryByText('AWS setup')).not.toBeInTheDocument();
    // General section still visible
    expect(screen.getByTestId('section-Pre-arrival')).toBeInTheDocument();
  });
});
```

**Pass condition:** DevOps section table renders when `isDevOps=true`; does not render when `isDevOps=false`.

---

### C-5: Offboarding tab shows the offboarding checklist for a terminated employee

This test also goes in `tests/unit/components/employee-checklist-row.test.tsx`:

```typescript
describe('EmployeeChecklistRow - Offboarding mode', () => {
  const terminatedEmployee = {
    id: 'emp-term',
    firstName: 'Bob',
    lastName: 'Jones',
    avatar: null,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2026-03-15'),
    department: { name: 'Sales' },
    offboardingTasks: [{ id: 'ot1', status: 'NOT_STARTED' }],
  };

  const offboardingSections = [
    {
      section: 'HR',
      tasks: [
        { id: 'ot1', title: 'Exit interview scheduled', status: 'NOT_STARTED', dueDate: null, notes: null, assignee: null },
        { id: 'ot2', title: 'Return company equipment', status: 'DONE', dueDate: null, notes: null, assignee: null },
      ],
    },
  ];

  it('C-5: offboarding mode fetches and shows the offboarding checklist', async () => {
    vi.mocked(trpc.onboarding.getOffboardingChecklist.useQuery).mockReturnValue({
      data: offboardingSections,
      isLoading: false,
    } as any);

    render(
      <EmployeeChecklistRow employee={terminatedEmployee as any} mode="offboarding" />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: /bob jones/i }));

    expect(screen.getByTestId('section-HR')).toBeInTheDocument();
    expect(screen.getByText('Exit interview scheduled')).toBeInTheDocument();
    expect(screen.getByText('Return company equipment')).toBeInTheDocument();
  });
});
```

**Pass condition:** After expanding the row in offboarding mode, the HR section with offboarding tasks is visible.

---

## Priority 4 — Stale Test Cleanup

The following 9 tests in `tests/unit/components/onboarding-page.test.tsx` test the OLD card-based page UI that no longer exists after Task 7. They must be removed or replaced:

| Test | Reason for removal | Replacement |
|------|--------------------|-------------|
| `renders loading state` | Still valid concept — update to work with new page. Loading state now renders pulse skeleton divs instead of `Loading...` text. Keep but fix assertion. | Keep, update assertion |
| `renders "No new hires" when data is empty` | Text changed to `No employees currently being onboarded.` | Keep, update text |
| `renders employee names and progress correctly` | Old card DOM (`firstName + ' ' + lastName`), old `X/Y tasks` text format. EmployeeChecklistRow now renders names. | Replace with C-1 |
| `calculates progress percentage correctly for styles` | Old CSS selector `.bg-gray-100 div.bg-primary-500` gone. Progress bar is now inside `EmployeeChecklistRow` (mocked). | Remove entirely |
| `handles zero tasks correctly` | Same CSS selector issue | Remove entirely |
| `applies the correct badge variant based on progress` | Old `text-yellow-800` badge CSS class gone | Remove entirely |
| `handles multiple employees with different progress levels` | Old CSS progress bar selectors gone | Remove entirely |
| `shows Start Onboarding button only when total tasks is 0` | `StartOnboardingModal` and per-card start button removed from new page | Remove entirely |
| `opens StartOnboardingModal when Start Onboarding is clicked` | `StartOnboardingModal` removed from new page | Remove entirely |
| `opens AddTaskModal when Plus icon button is clicked` | `AddTaskModal` per-card plus button removed from new page | Remove entirely |

**Action items for the implementing subagent:**
1. Remove the `vi.mock('@/components/onboarding/add-task-modal', ...)` and `vi.mock('@/components/onboarding/start-onboarding-modal', ...)` mock blocks (those components are no longer used in the page).
2. Remove the old `mockEmployees` array that uses the old data shape (`onboardingTasks: [{ status: 'COMPLETED' }]`).
3. Remove all 9 old `describe('OnboardingPage', ...)` tests.
4. Replace with the new mock setup and `describe('OnboardingPage - new design', ...)` block from Priority 3 (C-1, C-2, C-3) plus two retained/updated tests for loading and empty-state concepts.

**Retained/updated tests to keep from old suite:**

```typescript
it('renders loading state (skeleton)', () => {
  vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: undefined, isLoading: true } as any);
  vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: undefined, isLoading: false } as any);

  const { container } = render(<OnboardingPage />, { wrapper: Wrapper });
  // New loading state shows skeleton pulse divs
  const skeletons = container.querySelectorAll('.animate-pulse');
  expect(skeletons.length).toBeGreaterThan(0);
});

it('renders empty state for onboarding tab', () => {
  vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
  vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);

  render(<OnboardingPage />, { wrapper: Wrapper });
  expect(screen.getByText(/no employees currently being onboarded/i)).toBeInTheDocument();
});
```

---

## Test File Summary

| File | Action | Tests after |
|------|--------|-------------|
| `tests/unit/routers/onboarding.router.test.ts` | Update 3 existing tests (R-1, R-2, R-3, R-4), add 10 new tests (O-1 through O-7) | 19 total |
| `tests/unit/components/onboarding-page.test.tsx` | Remove 9 stale tests, add 5 new (C-1, C-2, C-3, loading, empty-state) | 5 total |
| `tests/unit/components/employee-checklist-row.test.tsx` | Create new file with C-4a, C-4b, C-5 | 3 total |

**Total automated checks: 27**

---

## Run Commands

```bash
# Router tests
npx vitest run tests/unit/routers/onboarding.router.test.ts --reporter=verbose

# Component tests
npx vitest run tests/unit/components/onboarding-page.test.tsx --reporter=verbose
npx vitest run tests/unit/components/employee-checklist-row.test.tsx --reporter=verbose

# Full suite (expect 1 known live-DB failure in employee.router.test.ts)
npx vitest run 2>&1 | tail -15
```

---

## Coverage Summary

| Area | Checks |
|------|--------|
| Router: `myTasks` (status filter fix) | R-1 |
| Router: `createTask` (no assigneeType) | R-2 |
| Router: `listNewHires` (new include shape) | R-3 |
| Router: `getChecklist` returns/groups by section | O-1, O-2 |
| Router: `getChecklist` company isolation | O-3 |
| Router: `updateTaskStatus` persists status | O-4 |
| Router: `startOffboarding` creates tasks | O-5 |
| Router: `updateOffboardingTaskStatus` | O-6 |
| Router: `listOffboarding` company isolation | O-7 |
| Page: two-tab default state (Onboarding) | C-1 |
| Page: tab switch shows Offboarding employees | C-2 |
| Page: empty state on Offboarding tab | C-3 |
| Component: DevOps section visible for Engineering | C-4a |
| Component: DevOps section hidden for non-Engineering | C-4b |
| Component: Offboarding checklist renders in offboarding mode | C-5 |
| Page: loading skeleton renders | loading test |
| Page: onboarding empty state text | empty-state test |
