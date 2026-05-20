# Advanced Time Off Polishing Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a pro-rated accrual engine and a high-fidelity horizontal team calendar for the Time Off module.

**Architecture:** We will create a central `AccrualEngine` utility, update the tRPC router to provide dynamic balances, and build a new horizontal timeline UI for team visibility.

**Tech Stack:** Next.js, tRPC, Prisma, Tailwind CSS, date-fns, Lucide React.

---

### Task 1: Implement Accrual Engine Utility

**Files:**
- Create: `src/lib/accrual-engine.ts`
- Test: `tests/unit/lib/accrual-engine.test.ts` (Create)

**Step 1: Write failing tests for pro-rated calculation**
- Test 1: Full year accrual for existing employee.
- Test 2: Pro-rated accrual for mid-year hire.
- Test 3: Capped carryover calculation on Jan 1st.

**Step 2: Implement `calculateBalance` function**
- Logic: `(Months Elapsed * Accrual Rate) + Carryover - Used`.

**Step 3: Run tests to verify they pass**

**Step 4: Commit**

---

### Task 2: Enhance tRPC Router with Dynamic Balances

**Files:**
- Modify: `src/server/routers/timeoff.ts`

**Step 1: Implement `getPolicyBalances` query**
- Logic: Fetch all policies and requests for the user, then run through `AccrualEngine`.
- Return: `accrued`, `used`, `available`, `projectedYearEnd`.

**Step 2: Update `submitRequest` with future-date validation**
- Logic: Ensure user has enough *accrued* days by the time their leave starts.

**Step 3: Commit**

---

### Task 3: Build Policy Balance Cards UI

**Files:**
- Create: `src/components/time-off/policy-balance-card.tsx`
- Modify: `src/app/(dashboard)/time-off/page.tsx`

**Step 1: Create `PolicyBalanceCard` component**
- Design: Progress bar (Lush green), detailed accrual tooltips.

**Step 2: Replace static list on Time Off page**
- Logic: Map through `getPolicyBalances` data.

**Step 3: Commit**

---

### Task 4: Implement Horizontal Team Calendar

**Files:**
- Create: `src/components/time-off/team-timeline.tsx`
- Modify: `src/app/(dashboard)/time-off/page.tsx`

**Step 1: Create `TeamTimeline` component**
- X-Axis: Days of the month (grid-cols-31).
- Y-Axis: Team members.
- Logic: Map `listRequests` data onto the grid.

**Step 2: Add "Collision" detection logic**
- Visual: Red outline if too many people are out on a specific day.

**Step 3: Commit**

---

### Task 5: Final Polish & Validation

**Step 1: Run full test suite**
- Command: `npm test`

**Step 2: Verify Dark Mode and HiBob styling consistency**

**Step 3: Commit**
