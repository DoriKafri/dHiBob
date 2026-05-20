# Golden Path Polish Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the "Golden Paths" of Social Posting, Time Off, Custom Tables, and Timeline are 100% functional and high-fidelity.

**Architecture:** We will implement missing tRPC mutations for posting and row management, add balance-aware logic to the time-off modal, and refine the milestone detection logic in the employee update flow.

**Tech Stack:** Next.js, tRPC, Prisma, Tailwind CSS, Lucide React.

---

### Task 1: Real Social Posting (Home Feed)

**Files:**
- Modify: `src/server/routers/home.ts`
- Create: `src/components/home/shoutout-modal.tsx`
- Modify: `src/app/(dashboard)/home/page.tsx`

**Step 1: Add `createShoutout` mutation**
- Input: `{ content: string, targetId: string }`.
- Logic: Create `Post` with `type: 'SHOUTOUT'`.

**Step 2: Build `ShoutoutModal`**
- Features: Employee autocomplete search, text area, "Post" button.

**Step 3: Integrate with Home Page**
- Make the "What's on your mind?" trigger open the modal.

**Step 4: Commit**

---

### Task 2: Balance-Aware Time Off Requests

**Files:**
- Modify: `src/components/time-off/request-form-modal.tsx`

**Step 1: Fetch and display "Available Balance"**
- Use `trpc.timeoff.getPolicyBalances.useQuery`.
- Display balance next to policy selector.

**Step 2: Add client-side validation**
- Disable "Submit" if requested days > available.

**Step 3: Commit**

---

### Task 3: Custom Tables Row Management

**Files:**
- Modify: `src/server/routers/custom.ts`
- Modify: `src/components/people/dynamic-table.tsx`

**Step 1: Add `deleteRow` mutation**
- Logic: Verify ownership/company before deleting.

**Step 2: Add Actions column to `DynamicTable`**
- Add Edit (re-opens modal) and Delete (trash icon) buttons.

**Step 3: Commit**

---

### Task 4: Precision Milestone Detection (Timeline)

**Files:**
- Modify: `src/server/routers/employee.ts`

**Step 1: Refine `update` mutation milestone logic**
- Perform field-by-field comparison (`jobTitle`, `departmentId`, `managerId`).
- Only create `JobRecord` for fields that *actually* changed.

**Step 2: Commit**

---

### Task 5: Final Verification & Polish

**Step 1: Run full test suite**
**Step 2: Visual pass on all new components**
**Step 3: Commit**
