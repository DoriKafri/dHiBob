# Onboarding & Offboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use trycycle-executing to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current minimal onboarding card-list UI with a full HiBob-style onboarding/offboarding module featuring sectioned task checklists, status tracking, assignee display, date columns, progress bars, and an offboarding tab — all backed by real tRPC procedures wired to the database.

**Architecture:** The existing `OnboardingTask` model and `onboardingRouter` are extended to support sections, per-task status (`NOT_STARTED`, `IN_PROGRESS`, `DONE`), assignees, dates, and notes. A new `OffboardingTask` model (and corresponding `OffboardingChecklist`) is added to the Prisma schema. The `/onboarding` page is redesigned as a two-tab view (Onboarding | Offboarding), showing a per-employee expandable checklist table. Task sections are stored as a `section` field on each task. Department-aware section visibility (DevOps section for Engineering employees) is implemented via a `sectionType` field. Both task types share a unified column layout: Item, Person (assignee avatar), Status (badge, clickable to cycle), Date, Notes.

**Tech Stack:** Next.js 14 App Router, tRPC v10, Prisma ORM (PostgreSQL), Tailwind CSS, Radix UI, Vitest + Testing Library.

---

## File Structure

**Schema changes:**
- `prisma/schema.prisma` — extend `OnboardingTask`, add `OffboardingTask` + `OffboardingChecklist` models

**Router changes:**
- `src/server/routers/onboarding.ts` — add `getChecklist`, `updateTaskStatus`, `startOffboarding`, `getOffboardingChecklist`, `updateOffboardingTaskStatus`

**New components:**
- `src/components/onboarding/checklist-table.tsx` — shared table (Item, Person, Status, Date, Notes) used by both onboarding and offboarding tabs
- `src/components/onboarding/employee-checklist-row.tsx` — expandable row for an employee in the list; on expand shows `checklist-table`
- `src/components/onboarding/status-badge.tsx` — clickable status badge cycling NOT_STARTED → IN_PROGRESS → DONE
- `src/components/onboarding/offboarding-tab.tsx` — offboarding tab content (list of employees being offboarded)

**Modified pages/components:**
- `src/app/(dashboard)/onboarding/page.tsx` — full redesign: two tabs (Onboarding | Offboarding), employee rows with progress, expandable checklist
- `src/components/onboarding/add-task-modal.tsx` — add `section` and `assigneeId` fields

**Seed data:**
- `prisma/seed.ts` — add sample onboarding + offboarding tasks with sections, statuses, and dates

**Tests:**
- `tests/unit/routers/onboarding.router.test.ts` — extend with new procedure tests (O-1 through O-7 from strategy)
- `tests/unit/components/onboarding-page.test.tsx` — extend with new UI tests (C-1 through C-5 from strategy)

---

## Task 1: Extend Prisma Schema — OnboardingTask + OffboardingTask

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Identify failing test**

No test covers the schema fields yet. We will write the router tests in Task 3; this task is purely schema + migration. Verify the current schema is correct before editing:

```bash
grep -n "OnboardingTask\|OffboardingTask" prisma/schema.prisma
```

Expected: `OnboardingTask` model present, no `OffboardingTask` model.

- [ ] **Step 2: Extend `OnboardingTask` model and add `OffboardingTask`**

Open `prisma/schema.prisma`. Replace the existing `OnboardingTask` model:

```prisma
model OnboardingTask {
  id           String    @id @default(cuid())
  templateId   String?
  employeeId   String
  title        String
  description  String?
  section      String    @default("General")     // e.g. "Pre-arrival", "First week", "Upcoming meetings", "DevOps"
  sectionType  String    @default("GENERAL")     // GENERAL | DEVOPS — controls dept-gated visibility
  assigneeId   String?                            // FK to Employee (who is responsible)
  dueDate      DateTime?
  completedAt  DateTime?
  notes        String?
  status       String    @default("NOT_STARTED") // NOT_STARTED | IN_PROGRESS | DONE
  sortOrder    Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  template     OnboardingTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  employee     Employee            @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  assignee     Employee?           @relation("OnboardingTaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  @@index([employeeId])
  @@index([templateId])
  @@index([status])
  @@index([assigneeId])
}
```

Add the `OffboardingTask` model after `OnboardingTask`:

```prisma
model OffboardingTask {
  id          String    @id @default(cuid())
  employeeId  String
  title       String
  section     String    @default("General")
  assigneeId  String?
  dueDate     DateTime?
  completedAt DateTime?
  notes       String?
  status      String    @default("NOT_STARTED") // NOT_STARTED | IN_PROGRESS | DONE
  sortOrder   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  employee    Employee  @relation("OffboardingTasks", fields: [employeeId], references: [id], onDelete: Cascade)
  assignee    Employee? @relation("OffboardingTaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  @@index([employeeId])
  @@index([status])
  @@index([assigneeId])
}
```

Add relations to the `Employee` model (find the existing `onboardingTasks` line and add the new ones):

```prisma
  onboardingTasks        OnboardingTask[]
  onboardingTasksAssigned OnboardingTask[] @relation("OnboardingTaskAssignee")
  offboardingTasks       OffboardingTask[] @relation("OffboardingTasks")
  offboardingTasksAssigned OffboardingTask[] @relation("OffboardingTaskAssignee")
```

- [ ] **Step 3: Push schema to DB**

```bash
npx prisma db push
```

Expected: schema synced, no errors.

- [ ] **Step 4: Verify generation**

```bash
npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: extend OnboardingTask schema + add OffboardingTask model"
```

---

## Task 2: Add Seed Data for Onboarding & Offboarding

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Check current seed structure**

```bash
grep -n "onboarding\|Onboarding\|offboarding" prisma/seed.ts | head -20
```

Note where employees and companies are seeded so we can reference their IDs.

- [ ] **Step 2: Add onboarding + offboarding tasks to seed**

In `prisma/seed.ts`, after employees are seeded, add a section that creates onboarding tasks for the most recently hired employee (e.g., the last created ACTIVE employee with no existing onboarding tasks), and offboarding tasks for any TERMINATED employee. Use `upsert` or guard with `skipDuplicates`.

Find a recently hired active employee and a terminated employee from the existing seed data. Seed tasks using `createMany` with `skipDuplicates: true`:

```typescript
// Find employees to seed tasks for
const newHire = await prisma.employee.findFirst({
  where: { companyId: acme.id, status: 'ACTIVE' },
  orderBy: { startDate: 'desc' },
});
const terminated = await prisma.employee.findFirst({
  where: { companyId: acme.id, status: 'TERMINATED' },
  orderBy: { endDate: 'desc' },
});

// Seed onboarding tasks with sections
if (newHire) {
  const onboardingTasks = [
    // Section: Pre-arrival
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Approving recruitment', sortOrder: 1, status: 'DONE', dueDate: new Date('2026-08-28'), employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Notifying Candidate & HR', sortOrder: 2, status: 'DONE', dueDate: new Date('2026-08-28'), employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Contact Candidate for onboarding', sortOrder: 3, status: 'DONE', dueDate: new Date('2026-08-28'), employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Is computer needed?', sortOrder: 4, status: 'DONE', dueDate: new Date('2026-08-28'), employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Choosing Team Lead', sortOrder: 5, status: 'NOT_STARTED', employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Scheduling Kick Off (Internal)', sortOrder: 6, status: 'NOT_STARTED', employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Sending work start invite (on-site / remote)', sortOrder: 7, status: 'NOT_STARTED', employeeId: newHire.id },
    { section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Updating candidate & client info on Monday', sortOrder: 8, status: 'NOT_STARTED', employeeId: newHire.id },
    // Section: Upcoming meetings
    { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a Welcome meeting with TL', sortOrder: 1, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a Welcome meeting with Head of delivery', sortOrder: 2, status: 'DONE', dueDate: new Date('2026-02-04'), employeeId: newHire.id },
    { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR- 1 week later', sortOrder: 3, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR- 1 month later', sortOrder: 4, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR- 3 months later', sortOrder: 5, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    // Section: First day tasks
    { section: 'First day', sectionType: 'GENERAL', title: 'Contract', sortOrder: 1, status: 'DONE', dueDate: new Date('2026-01-28'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Buddy', sortOrder: 2, status: 'DONE', dueDate: new Date('2026-01-28'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Sending the employee a "welcome aboard" mail', sortOrder: 3, status: 'DONE', dueDate: new Date('2026-01-28'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Michpal - 101 form', sortOrder: 4, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Academy ocean', sortOrder: 5, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'DreamTeam', sortOrder: 6, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'BuyMe', sortOrder: 7, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Accountant (Ben)', sortOrder: 8, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Insurance (Amnon Gur)', sortOrder: 9, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Zone (Hitechzone)', sortOrder: 10, status: 'IN_PROGRESS', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Uploading salary plan on Dream team', sortOrder: 11, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Cover', sortOrder: 12, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Add to birthday calendar', sortOrder: 13, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Add to "contact us" sheet + Notion', sortOrder: 14, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Add to delivery sheet', sortOrder: 15, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Toggl', sortOrder: 16, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Slack', sortOrder: 17, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Mindspace card', sortOrder: 18, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Changing WS account (Tzvika)', sortOrder: 19, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'Add to delivery group', sortOrder: 20, status: 'DONE', dueDate: new Date('2026-01-29'), employeeId: newHire.id },
    { section: 'First day', sectionType: 'GENERAL', title: 'welcome gift', sortOrder: 21, status: 'DONE', dueDate: new Date('2026-02-01'), employeeId: newHire.id },
    // DevOps section — only shown for Engineering dept employees
    { section: 'DevOps', sectionType: 'DEVOPS', title: 'AWS account setup', sortOrder: 1, status: 'NOT_STARTED', employeeId: newHire.id },
    { section: 'DevOps', sectionType: 'DEVOPS', title: 'GitHub org invitation', sortOrder: 2, status: 'NOT_STARTED', employeeId: newHire.id },
    { section: 'DevOps', sectionType: 'DEVOPS', title: 'VPN access', sortOrder: 3, status: 'NOT_STARTED', employeeId: newHire.id },
    { section: 'DevOps', sectionType: 'DEVOPS', title: 'Set up development environment', sortOrder: 4, status: 'NOT_STARTED', employeeId: newHire.id },
  ];
  await prisma.onboardingTask.createMany({ data: onboardingTasks, skipDuplicates: true });
}

// Seed offboarding tasks
if (terminated) {
  const offboardingTasks = [
    { section: 'HR', title: 'האם העובד פוטר או התפטר?', sortOrder: 1, status: 'DONE', dueDate: new Date('2026-02-16'), employeeId: terminated.id },
    { section: 'HR', title: 'מכתב סיום העסקה', sortOrder: 2, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'עדכון צביקה על סיום העסקה וסגירת יזר', sortOrder: 3, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'אישור תקופת העסקה', sortOrder: 4, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'שליחת מסמכי שחרור לפנסיה', sortOrder: 5, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'ביטול ביימי ומחיקה מיומן ימי הולדת', sortOrder: 6, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'גמר חשבון', sortOrder: 7, status: 'DONE', dueDate: new Date('2026-04-05'), employeeId: terminated.id },
    { section: 'HR', title: 'ביטול זון/ סיבוס', sortOrder: 8, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'עדכון סיום העסקה בדרים טים', sortOrder: 9, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'עדכון בפורטל מעסיקים אמנון גור', sortOrder: 10, status: 'IN_PROGRESS', employeeId: terminated.id },
    { section: 'HR', title: 'החזרת ציוד למשרד דבליף', sortOrder: 11, status: 'IN_PROGRESS', employeeId: terminated.id },
    { section: 'HR', title: 'שיחת HR', sortOrder: 12, status: 'DONE', dueDate: new Date('2026-03-12'), employeeId: terminated.id },
    { section: 'HR', title: 'ביטול קאבר', sortOrder: 13, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'לבדוק האם יש הלוואה ולטפל', sortOrder: 14, status: 'DONE', dueDate: new Date('2026-03-17'), employeeId: terminated.id },
    { section: 'HR', title: 'לעדכן את אליעד ואת ביטוחי הבריאות לגבי עזיבה', sortOrder: 15, status: 'DONE', dueDate: new Date('2026-03-23'), employeeId: terminated.id },
    { section: 'HR', title: 'לבדוק אם יש לעובד מניות VESTED', sortOrder: 16, status: 'DONE', dueDate: new Date('2026-03-22'), employeeId: terminated.id },
    { section: 'HR', title: 'ביצוע רכישת מניות בתלוש השכר', sortOrder: 17, status: 'DONE', dueDate: new Date('2026-03-22'), employeeId: terminated.id },
  ];
  await prisma.offboardingTask.createMany({ data: offboardingTasks, skipDuplicates: true });
}
```

- [ ] **Step 3: Run seed (against live DB if available)**

```bash
DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob" npx tsx prisma/seed.ts
```

If no live DB is available, verify the seed code is syntactically correct with:

```bash
npx tsc --noEmit prisma/seed.ts 2>&1 | head -20 || true
```

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: add onboarding/offboarding seed data with sections and statuses"
```

---

## Task 3: Extend the Onboarding tRPC Router

**Files:**
- Modify: `src/server/routers/onboarding.ts`

The current router has: `myTasks`, `createTask`, `start`, `listNewHires`, `listTemplates`. We need to add:
- `getChecklist(employeeId)` — returns tasks grouped by section, including assignee info
- `updateTaskStatus(taskId, status)` — updates a single onboarding task status
- `startOffboarding(employeeId)` — creates a default offboarding checklist for an employee
- `getOffboardingChecklist(employeeId)` — returns offboarding tasks grouped by section
- `updateOffboardingTaskStatus(taskId, status)` — updates a single offboarding task status
- `listOffboarding` — list employees currently being offboarded (status TERMINATED + have offboarding tasks)

- [ ] **Step 1: Write failing tests for new procedures**

**Before adding new tests**, update the existing `myTasks` test in `tests/unit/routers/onboarding.router.test.ts` to match the updated status filter. The existing test at line 35 asserts `status: 'PENDING'` — this must be updated to `status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }` to match the fixed router. Also update the existing `createTask` test: remove `assigneeType: 'HR'` from the `input` object (line 50) since `assigneeType` is no longer in the schema or input schema.

In `tests/unit/routers/onboarding.router.test.ts`, add the following mock additions and new `describe` blocks:

First, extend the vi.mock at the top to include `offboardingTask` and the new `onboardingTask` methods:

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

Then add new test cases:

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
});

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

  it('O-6: updateOffboardingTaskStatus persists the new status', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.offboardingTask.update as any).mockResolvedValue({ id: 'ot1', status: 'DONE' });

    const result = await caller.onboarding.updateOffboardingTaskStatus({ taskId: 'ot1', status: 'DONE' });
    expect(result.status).toBe('DONE');
  });

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

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/routers/onboarding.router.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: new tests FAIL (procedures don't exist yet), existing 9 tests pass.

- [ ] **Step 3: Implement new router procedures**

Replace the full content of `src/server/routers/onboarding.ts`:

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const taskStatusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']);

// Default offboarding checklist template
const DEFAULT_OFFBOARDING_TASKS = [
  { section: 'HR', title: 'Exit interview scheduled', sortOrder: 1 },
  { section: 'HR', title: 'Return company equipment', sortOrder: 2 },
  { section: 'HR', title: 'Revoke system access', sortOrder: 3 },
  { section: 'HR', title: 'Final paycheck processed', sortOrder: 4 },
  { section: 'HR', title: 'Benefits termination', sortOrder: 5 },
  { section: 'IT', title: 'Disable email account', sortOrder: 1 },
  { section: 'IT', title: 'Remove from Slack/Teams', sortOrder: 2 },
  { section: 'IT', title: 'Revoke VPN access', sortOrder: 3 },
  { section: 'IT', title: 'Transfer data ownership', sortOrder: 4 },
];

export const onboardingRouter = router({
  // Existing procedures
  // NOTE: status filter updated from 'PENDING' to match new status values (NOT_STARTED/IN_PROGRESS/DONE)
  myTasks: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.onboardingTask.findMany({
      where: { assigneeId: ctx.user.id, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
    });
  }),

  createTask: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      // assigneeType removed — field no longer exists on OnboardingTask schema
      assigneeId: z.string().optional(),
      dueDate: z.coerce.date().optional(),
      section: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found or does not belong to your company' });
      }
      return ctx.db.onboardingTask.create({
        data: {
          employeeId: input.employeeId,
          title: input.title,
          description: input.description,
          assigneeId: input.assigneeId,
          dueDate: input.dueDate,
          section: input.section ?? 'General',
          sectionType: 'GENERAL',
          status: 'NOT_STARTED',
        },
      });
    }),

  start: protectedProcedure
    .input(z.object({ employeeId: z.string(), templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found or does not belong to your company' });

      const template = await ctx.db.onboardingTemplate.findFirst({
        where: { id: input.templateId, companyId: ctx.user.companyId }
      });
      if (!template) throw new TRPCError({ code: 'NOT_FOUND' });

      let taskTitles: string[];
      try {
        taskTitles = JSON.parse(template.tasks) as string[];
        if (!Array.isArray(taskTitles)) throw new Error('Tasks must be an array');
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse template tasks' });
      }

      return ctx.db.onboardingTask.createMany({
        data: taskTitles.map((title, i) => ({
          employeeId: input.employeeId,
          templateId: input.templateId,
          title,
          section: 'General',
          sectionType: 'GENERAL',
          // assigneeType removed — field no longer exists on schema after Task 1 extension
          status: 'NOT_STARTED',
          sortOrder: i,
        }))
      });
    }),

  listNewHires: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      include: {
        onboardingTasks: {
          orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
          include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }),

  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.onboardingTemplate.findMany({ where: { companyId: ctx.user.companyId } });
  }),

  // NEW: Get checklist grouped by section for a specific employee
  getChecklist: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      const tasks = await ctx.db.onboardingTask.findMany({
        where: { employeeId: input.employeeId },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });

      // Group by section preserving insertion order
      const sectionMap = new Map<string, { section: string; sectionType: string; tasks: typeof tasks }>();
      for (const task of tasks) {
        if (!sectionMap.has(task.section)) {
          sectionMap.set(task.section, { section: task.section, sectionType: task.sectionType, tasks: [] });
        }
        sectionMap.get(task.section)!.tasks.push(task);
      }
      return Array.from(sectionMap.values());
    }),

  // NEW: Update single onboarding task status
  updateTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.string(), status: taskStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.onboardingTask.update({
        where: { id: input.taskId },
        data: {
          status: input.status,
          completedAt: input.status === 'DONE' ? new Date() : null,
        },
      });
    }),

  // NEW: Start offboarding for a terminated employee
  startOffboarding: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      return ctx.db.offboardingTask.createMany({
        data: DEFAULT_OFFBOARDING_TASKS.map(t => ({
          ...t,
          employeeId: input.employeeId,
          status: 'NOT_STARTED',
        })),
        skipDuplicates: true,
      });
    }),

  // NEW: Get offboarding checklist grouped by section
  getOffboardingChecklist: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      const tasks = await ctx.db.offboardingTask.findMany({
        where: { employeeId: input.employeeId },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });

      const sectionMap = new Map<string, { section: string; tasks: typeof tasks }>();
      for (const task of tasks) {
        if (!sectionMap.has(task.section)) {
          sectionMap.set(task.section, { section: task.section, tasks: [] });
        }
        sectionMap.get(task.section)!.tasks.push(task);
      }
      return Array.from(sectionMap.values());
    }),

  // NEW: Update single offboarding task status
  updateOffboardingTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.string(), status: taskStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.offboardingTask.update({
        where: { id: input.taskId },
        data: {
          status: input.status,
          completedAt: input.status === 'DONE' ? new Date() : null,
        },
      });
    }),

  // NEW: List employees being offboarded (TERMINATED status)
  listOffboarding: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'TERMINATED' },
      include: {
        offboardingTasks: {
          orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
          include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'desc' },
    });
  }),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/routers/onboarding.router.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: all tests (old 9 + new 10) pass.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "onboarding" | head -20
```

Expected: no errors related to onboarding router.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/onboarding.ts tests/unit/routers/onboarding.router.test.ts
git commit -m "feat: add getChecklist, updateTaskStatus, offboarding procedures to onboarding router"
```

---

## Task 4: Build Shared StatusBadge Component

**Files:**
- Create: `src/components/onboarding/status-badge.tsx`

This is a small, reusable clickable badge that cycles through `NOT_STARTED → IN_PROGRESS → DONE` and calls a callback.

- [ ] **Step 1: No test for this component — it will be covered by the page-level component tests in Task 7. Skip to implementation.**

- [ ] **Step 2: Create the component**

Create `src/components/onboarding/status-badge.tsx`:

```typescript
"use client";

interface StatusBadgeProps {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  onStatusChange?: (next: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE') => void;
  readonly?: boolean;
}

const STATUS_CYCLE: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE'> = {
  NOT_STARTED: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'NOT_STARTED',
};

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Working on it',
  DONE: 'Done',
};

const STATUS_STYLE: Record<string, string> = {
  NOT_STARTED: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  IN_PROGRESS: 'bg-amber-400 text-white',
  DONE: 'bg-emerald-500 text-white',
};

export function StatusBadge({ status, onStatusChange, readonly = false }: StatusBadgeProps) {
  const handleClick = () => {
    if (!readonly && onStatusChange) {
      onStatusChange(STATUS_CYCLE[status]);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={readonly}
      className={`
        inline-flex items-center justify-center px-3 py-1 rounded text-sm font-medium min-w-[110px]
        ${STATUS_STYLE[status]}
        ${!readonly ? 'cursor-pointer hover:opacity-90 transition-opacity' : 'cursor-default'}
      `}
      aria-label={`Status: ${STATUS_LABEL[status]}${!readonly ? ', click to change' : ''}`}
    >
      {STATUS_LABEL[status]}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/status-badge.tsx
git commit -m "feat: add StatusBadge component for onboarding/offboarding task status cycling"
```

---

## Task 5: Build ChecklistTable Component

**Files:**
- Create: `src/components/onboarding/checklist-table.tsx`

This renders a section's tasks as a table with columns: checkbox, Item (title), Person (assignee avatar/initials), Status (StatusBadge), Date, Notes.

- [ ] **Step 1: Create the component**

Create `src/components/onboarding/checklist-table.tsx`:

```typescript
"use client";

import { StatusBadge } from './status-badge';

interface Assignee {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

interface ChecklistTask {
  id: string;
  title: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  dueDate?: Date | string | null;
  notes?: string | null;
  assignee?: Assignee | null;
}

interface ChecklistSection {
  section: string;
  tasks: ChecklistTask[];
}

interface ChecklistTableProps {
  sections: ChecklistSection[];
  onStatusChange?: (taskId: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE') => void;
  readonly?: boolean;
}

function AssigneeAvatar({ assignee }: { assignee: Assignee | null | undefined }) {
  if (!assignee) return <span className="text-gray-400">—</span>;
  if (assignee.avatar) {
    return (
      <img
        src={assignee.avatar}
        alt={`${assignee.firstName} ${assignee.lastName}`}
        className="w-7 h-7 rounded-full object-cover"
        title={`${assignee.firstName} ${assignee.lastName}`}
      />
    );
  }
  const initials = `${assignee.firstName[0]}${assignee.lastName[0]}`.toUpperCase();
  return (
    <span
      className="w-7 h-7 rounded-full bg-purple-500 text-white text-xs font-medium inline-flex items-center justify-center"
      title={`${assignee.firstName} ${assignee.lastName}`}
    >
      {initials}
    </span>
  );
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChecklistTable({ sections, onStatusChange, readonly = false }: ChecklistTableProps) {
  if (sections.length === 0) return <p className="text-sm text-gray-500 py-4">No tasks yet.</p>;

  return (
    <div className="space-y-4">
      {sections.map(({ section, tasks }) => (
        <div key={section}>
          {/* Section header as collapsible group label */}
          <div className="flex items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700 mb-1">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{section}</span>
            <span className="text-xs text-gray-400">({tasks.length})</span>
          </div>
          <table className="w-full text-sm" data-testid={`section-${section}`}>
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-1 pl-2 font-normal w-6"></th>
                <th className="text-left py-1 font-normal">Item</th>
                <th className="text-left py-1 px-4 font-normal w-20">Person</th>
                <th className="text-left py-1 px-4 font-normal w-36">Status</th>
                <th className="text-left py-1 px-4 font-normal w-24">Date</th>
                <th className="text-left py-1 px-4 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2 pl-2">
                    <input
                      type="checkbox"
                      checked={task.status === 'DONE'}
                      onChange={() => {
                        if (!readonly && onStatusChange) {
                          onStatusChange(task.id, task.status === 'DONE' ? 'NOT_STARTED' : 'DONE');
                        }
                      }}
                      className="rounded border-gray-300"
                      aria-label={`Mark ${task.title} as done`}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <span className={task.status === 'DONE' ? 'line-through text-gray-400' : ''}>
                      {task.title}
                    </span>
                  </td>
                  <td className="py-2 px-4">
                    <AssigneeAvatar assignee={task.assignee} />
                  </td>
                  <td className="py-2 px-4">
                    <StatusBadge
                      status={task.status}
                      onStatusChange={readonly ? undefined : (next) => onStatusChange?.(task.id, next)}
                      readonly={readonly}
                    />
                  </td>
                  <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">
                    {formatDate(task.dueDate)}
                  </td>
                  <td className="py-2 px-4 text-gray-500 text-xs">
                    {task.notes ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/checklist-table.tsx
git commit -m "feat: add ChecklistTable component with section grouping, StatusBadge, assignee avatars"
```

---

## Task 6: Build EmployeeChecklistRow Component

**Files:**
- Create: `src/components/onboarding/employee-checklist-row.tsx`

An expandable row for a single employee in the list. Shows name, department, start/end date, progress bar, and on expand shows the full `ChecklistTable`.

- [ ] **Step 1: Create the component**

Create `src/components/onboarding/employee-checklist-row.tsx`:

```typescript
"use client";

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ChecklistTable } from './checklist-table';
import { trpc } from '@/lib/trpc';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  department?: { name: string } | null;
  onboardingTasks?: Array<{ status: string }>;
  offboardingTasks?: Array<{ status: string }>;
}

interface EmployeeChecklistRowProps {
  employee: Employee;
  mode: 'onboarding' | 'offboarding';
  isDevOps?: boolean;
}

export function EmployeeChecklistRow({ employee, mode, isDevOps = false }: EmployeeChecklistRowProps) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const tasks = mode === 'onboarding' ? (employee.onboardingTasks ?? []) : (employee.offboardingTasks ?? []);
  const done = tasks.filter(t => t.status === 'DONE').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Lazy-load the full checklist when expanded
  const checklistQuery = mode === 'onboarding'
    ? trpc.onboarding.getChecklist.useQuery(
        { employeeId: employee.id },
        { enabled: expanded }
      )
    : trpc.onboarding.getOffboardingChecklist.useQuery(
        { employeeId: employee.id },
        { enabled: expanded }
      );

  const updateOnboarding = trpc.onboarding.updateTaskStatus.useMutation({
    onSuccess: () => {
      utils.onboarding.listNewHires.invalidate();
      utils.onboarding.getChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const updateOffboarding = trpc.onboarding.updateOffboardingTaskStatus.useMutation({
    onSuccess: () => {
      utils.onboarding.listOffboarding.invalidate();
      utils.onboarding.getOffboardingChecklist.invalidate({ employeeId: employee.id });
    },
  });

  const handleStatusChange = (taskId: string, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE') => {
    if (mode === 'onboarding') {
      updateOnboarding.mutate({ taskId, status });
    } else {
      updateOffboarding.mutate({ taskId, status });
    }
  };

  const name = `${employee.firstName} ${employee.lastName}`;
  const dateLabel = mode === 'onboarding'
    ? `Starts ${new Date(employee.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : employee.endDate
      ? `Ended ${new Date(employee.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'End date TBD';

  // Filter out DevOps section for non-DevOps employees
  const sections = (checklistQuery.data ?? []).filter(s =>
    isDevOps || s.sectionType !== 'DEVOPS'
  );

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}

        {/* Avatar */}
        {employee.avatar ? (
          <img src={employee.avatar} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-medium inline-flex items-center justify-center shrink-0">
            {employee.firstName[0]}{employee.lastName[0]}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{name}</p>
          <p className="text-xs text-gray-500">{employee.department?.name ?? ''} · {dateLabel}</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-2 bg-emerald-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
              aria-label={`${pct}% complete`}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
        </div>
      </button>

      {/* Expanded checklist */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
          {checklistQuery.isLoading && <p className="text-sm text-gray-500 py-4">Loading tasks...</p>}
          {!checklistQuery.isLoading && (
            <ChecklistTable
              sections={sections}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/employee-checklist-row.tsx
git commit -m "feat: add EmployeeChecklistRow with expandable checklist and lazy-loaded tasks"
```

---

## Task 7: Redesign the Onboarding/Offboarding Page

**Files:**
- Modify: `src/app/(dashboard)/onboarding/page.tsx`
- Modify: `tests/unit/components/onboarding-page.test.tsx`

This is the main page redesign. Two tabs: **Onboarding** (lists ACTIVE employees with onboarding tasks) and **Offboarding** (lists TERMINATED employees with offboarding tasks). Each employee is an `EmployeeChecklistRow`.

- [ ] **Step 1: Write failing component tests for the new UI**

Open `tests/unit/components/onboarding-page.test.tsx`. The existing tests cover the old card-based UI. Replace the mock setup and add new tests while keeping the passing existing ones where still applicable:

The existing mock covers `trpc.onboarding.listNewHires.useQuery`. The new page will also use `trpc.onboarding.listOffboarding.useQuery`. Extend the mock:

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

Add new tests:

```typescript
describe('OnboardingPage - new design', () => {
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

  it('C-1: shows onboarding tab active by default with employee rows', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: mockNewHires, isLoading: false } as any);
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);

    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByRole('tab', { name: /onboarding/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /offboarding/i })).toBeInTheDocument();
    expect(screen.getByTestId('employee-row-onboarding-emp-1')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('C-2: switching to Offboarding tab shows terminated employees', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: mockNewHires, isLoading: false } as any);
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: mockOffboarding, isLoading: false } as any);

    render(<OnboardingPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /offboarding/i }));

    expect(screen.getByTestId('employee-row-offboarding-emp-term')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('C-3: shows empty state on offboarding tab when no terminated employees', () => {
    vi.mocked(trpc.onboarding.listNewHires.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(trpc.onboarding.listOffboarding.useQuery).mockReturnValue({ data: [], isLoading: false } as any);

    render(<OnboardingPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /offboarding/i }));

    expect(screen.getByText(/no employees being offboarded/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npx vitest run tests/unit/components/onboarding-page.test.tsx --reporter=verbose 2>&1 | tail -25
```

Expected: new tests FAIL (page doesn't have tabs yet), existing tests may also fail now that the mock is changed — that's expected.

- [ ] **Step 3: Rewrite the onboarding page**

Replace `src/app/(dashboard)/onboarding/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmployeeChecklistRow } from "@/components/onboarding/employee-checklist-row";

type Tab = 'onboarding' | 'offboarding';

export default function OnboardingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('onboarding');

  const { data: newHires, isLoading: loadingOnboarding } = trpc.onboarding.listNewHires.useQuery();
  const { data: offboarding, isLoading: loadingOffboarding } = trpc.onboarding.listOffboarding.useQuery();

  const isLoading = activeTab === 'onboarding' ? loadingOnboarding : loadingOffboarding;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Onboarding & Offboarding</h1>
        <Button>
          <UserPlus size={16} className="mr-2" />
          New Hire
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['onboarding', 'offboarding'] as Tab[]).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-5 py-2 text-sm font-medium capitalize transition-colors
              ${activeTab === tab
                ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}
            `}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && activeTab === 'onboarding' && (
        <>
          {!newHires || newHires.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No employees currently being onboarded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {newHires.map(emp => (
                <EmployeeChecklistRow
                  key={emp.id}
                  employee={emp as any}
                  mode="onboarding"
                  isDevOps={emp.department?.name?.toLowerCase().includes('engineering') ?? false}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!isLoading && activeTab === 'offboarding' && (
        <>
          {!offboarding || offboarding.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No employees being offboarded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offboarding.map(emp => (
                <EmployeeChecklistRow
                  key={emp.id}
                  employee={emp as any}
                  mode="offboarding"
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the updated tests**

```bash
npx vitest run tests/unit/components/onboarding-page.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass (old tests that tested the card UI may need to be updated to match the new page structure — update them to test the new two-tab design). The old tests that tested `listNewHires` wiring, loading state, and empty state are still valid concepts but must match the new component structure. Update any that test stale DOM selectors (e.g., `.bg-primary-500` progress bar CSS selectors may differ) to use the new `data-testid` attributes or text content.

If old tests fail due to changed DOM structure:
- Remove tests for the old card UI that no longer reflect reality (the `calculates progress percentage correctly for styles` test that uses CSS class selectors like `.bg-gray-100 div.bg-primary-500`).
- Keep and update tests for: loading state, empty state, employee name display, tab switching.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before committing.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: 1 known pre-existing DB test failure (employee.router.test.ts live-DB test), all others pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/onboarding/page.tsx tests/unit/components/onboarding-page.test.tsx
git commit -m "feat: redesign onboarding page with two-tab layout (Onboarding/Offboarding) and employee checklist rows"
```

---

## Task 8: Wire add-task-modal to Support Sections

**Files:**
- Modify: `src/components/onboarding/add-task-modal.tsx`
- Modify: `tests/unit/components/add-task-modal.test.tsx`

The existing `AddTaskModal` doesn't include a `section` field. Add it so HR can specify which section a manually-added task belongs to.

- [ ] **Step 1: Check if add-task-modal test exists**

```bash
ls tests/unit/components/add-task-modal.test.tsx 2>/dev/null || echo "DOES NOT EXIST"
```

**Important:** This file does NOT currently exist. You must CREATE it (not add to an existing file). Check existing `onboarding-page.test.tsx` for the import pattern, mock setup, and `Wrapper` component to reuse.

- [ ] **Step 2: Create the test file with section field coverage**

Create `tests/unit/components/add-task-modal.test.tsx` with:
- Mock `@/lib/trpc` (same mock structure as `onboarding-page.test.tsx` — include `onboarding.createTask.useMutation`)
- Mock `@/components/ui/*` primitives if needed (Dialog, Input, Button, etc.)
- A `Wrapper` component identical to the one in `onboarding-page.test.tsx`
- Basic render test asserting the modal renders when `open=true`
- Section field test:

```typescript
it('includes section field in the form', () => {
  render(<AddTaskModal open={true} employeeId="emp-1" onClose={() => {}} />, { wrapper: Wrapper });
  expect(screen.getByLabelText(/section/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Update the modal to include section**

Modify `src/components/onboarding/add-task-modal.tsx`:

Add `section` to the form schema:

```typescript
const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  section: z.string().min(1, "Section is required"),
});
```

Add a section input after title:

```typescript
<div>
  <label htmlFor="section" className="block text-sm font-medium mb-1">Section</label>
  <Input id="section" {...register("section")} placeholder="e.g. Pre-arrival, First day" defaultValue="General" />
  {errors.section && <p className="text-xs text-red-600 mt-1">{errors.section.message}</p>}
</div>
```

Update the mutation call to include `section` (note: `assigneeType` is intentionally omitted — it was removed from the `createTask` input schema in Task 3 when the `OnboardingTask` schema was extended):

```typescript
await createTaskMutation.mutateAsync({
  employeeId,
  title: values.title,
  description: values.description,
  section: values.section,
  dueDate: values.dueDate ? new Date(values.dueDate) : undefined,
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/components/add-task-modal.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all pass including new section field test.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/add-task-modal.tsx tests/unit/components/add-task-modal.test.tsx
git commit -m "feat: add section field to AddTaskModal"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Full test suite**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: 1 pre-existing live-DB test failure (employee.router.test.ts), all others pass.

- [ ] **Step 2: TypeScript check — zero new errors**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: zero errors related to onboarding/offboarding files. Any pre-existing errors should not increase.

- [ ] **Step 3: Verify onboarding router procedures compile**

```bash
node -e "require('./src/server/routers/onboarding')" 2>&1 || true
```

- [ ] **Step 4: Commit final state**

If any uncommitted changes remain after the above tasks, commit them:

```bash
git add -A
git commit -m "chore: final verification pass for onboarding/offboarding redesign"
```

---

## Summary of What This Plan Builds

| Component | What it adds |
|---|---|
| `prisma/schema.prisma` | `OnboardingTask`: new fields `section`, `sectionType`, `notes`, `sortOrder`, changed `status` values; new `OffboardingTask` model |
| `prisma/seed.ts` | Sample onboarding tasks in 4 sections (Pre-arrival, Upcoming meetings, First day, DevOps) + offboarding tasks in HR section |
| `src/server/routers/onboarding.ts` | `getChecklist`, `updateTaskStatus`, `startOffboarding`, `getOffboardingChecklist`, `updateOffboardingTaskStatus`, `listOffboarding` |
| `src/components/onboarding/status-badge.tsx` | Clickable badge cycling NOT_STARTED→IN_PROGRESS→DONE with color coding |
| `src/components/onboarding/checklist-table.tsx` | Sectioned task table: checkbox, Item, Person avatar, Status, Date, Notes |
| `src/components/onboarding/employee-checklist-row.tsx` | Expandable employee row with progress bar + lazy-loaded `ChecklistTable` |
| `src/app/(dashboard)/onboarding/page.tsx` | Two-tab page (Onboarding / Offboarding) with employee rows |
| `src/components/onboarding/add-task-modal.tsx` | Section field added |
| Tests | Router tests O-1..O-7; Component tests C-1..C-3; add-task-modal section test |

**DevOps section visibility:** Tasks with `sectionType: 'DEVOPS'` are filtered out in `EmployeeChecklistRow` for employees whose department name does not include "engineering" (case-insensitive). This is the simplest correct implementation and avoids the need for a department-type field.

**Status values:** Changed from the old `PENDING`/`COMPLETED` to `NOT_STARTED`/`IN_PROGRESS`/`DONE` to match the HiBob reference screenshots. The `myTasks` procedure still uses the old `PENDING` filter — this is a known gap and can be addressed in a follow-up if the task widget is wired up.
