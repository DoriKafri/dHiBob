# Employee Timeline & Lifecycle Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a high-fidelity visual career timeline for employees, tracking milestones like hires, promotions, and department changes.

**Architecture:** We will add a `JobRecord` model to the schema to act as a historical ledger, create a tRPC aggregator to merge job and compensation history, and build a vertical timeline UI component.

**Tech Stack:** Next.js, tRPC, Prisma, Tailwind CSS, Lucide React.

---

### Task 1: Update Schema & Database

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add `JobRecord` model and relations**

```prisma
model Employee {
  // ... existing fields
  jobHistory JobRecord[]
}

model JobRecord {
  id            String   @id @default(cuid())
  employeeId    String
  type          String   // HIRED, PROMOTION, DEPT_CHANGE, MANAGER_CHANGE, NOTE
  effectiveDate DateTime
  title         String
  description   String?
  metadata      String   @default("{}") // Stores 'from' and 'to' values
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  @@index([employeeId])
}
```

**Step 2: Update `CompensationRecord` status type**
Ensure `type` includes `BASE_SALARY`, `BONUS`, `EQUITY`. (Already exists in design)

**Step 3: Generate Prisma Client**
Run: `npx prisma generate`

**Step 4: Commit**

---

### Task 2: Implement Timeline Aggregator Query

**Files:**
- Modify: `src/server/routers/employee.ts`
- Test: `tests/unit/routers/employee.timeline.test.ts` (Create)

**Step 1: Write failing test for `getTimeline`**
- Should return merged sorted list of Job and Compensation records.

**Step 2: Implement `getTimeline` query**
- Logic: Fetch `JobRecord` and `CompensationRecord`.
- Normalize: map to unified `{ id, type, date, title, description, isSensitive }` objects.
- Filter: Sensitive (salary) records only visible to self/manager/admin.

**Step 3: Commit**

---

### Task 3: Build Vertical Timeline UI

**Files:**
- Create: `src/components/people/lifecycle-timeline.tsx`
- Modify: `src/app/(dashboard)/people/[id]/page.tsx`

**Step 1: Create `LifecycleTimeline` component**
- Design: Vertical gray line with colored icons for nodes.
- Responsive cards for each event.

**Step 2: Add "Timeline" tab to Employee Profile**
- Integrate `LifecycleTimeline` component.

**Step 3: Commit**

---

### Task 4: Profile Update Integration

**Files:**
- Modify: `src/components/people/add-employee-modal.tsx` (or edit modal if separate)
- Modify: `src/server/routers/employee.ts`

**Step 1: Add "Create Timeline Milestone" checkbox to update form.**

**Step 2: Update `update` mutation to create `JobRecord`**
- If checkbox is true, compare old/new fields and create appropriate `JobRecord`.

**Step 3: Commit**

---

### Task 5: Final Validation & Polish

**Step 1: Run full test suite**
**Step 2: Visual styling check (Bob aesthetics)**
**Step 3: Commit**
