# Wire Onboarding Module (MVP) Design

## Overview
A unified Task Dashboard to handle new hire checklists, mimicking HiBob's core HR lifecycle feature.

## Architecture & UI Components
We'll build this as a new `wire-onboarding-module` within `src/app/(dashboard)/onboarding`.

1. **HR Admin Dashboard (`/onboarding`)**:
   - **Onboarding Pipeline View**: A Kanban-style board or a detailed Data Table (`ui/data-table.tsx`) showing all employees currently in onboarding and their overall progress (e.g., "60% Complete").
   - **Template Manager**: A sub-page to create and edit `OnboardingTemplate`s. Admins can define a series of tasks, descriptions, and dynamic assignees (e.g., 'MANAGER', 'IT', 'EMPLOYEE').
2. **"My Tasks" Widget (Global)**:
   - We'll add a new global `TasksPopover` component in the main `Header` (`components/layout/header.tsx`). This gives every user (managers, IT, new hires) a quick view of their pending `OnboardingTask` instances.
   - Clicking a task opens a side-drawer or dialog (`ui/dialog.tsx`) to view details, mark as complete, or leave a note.
3. **Employee Profile Onboarding Tab**:
   - Within the existing `src/app/(dashboard)/people/[id]/page.tsx` (the employee profile), we'll add an "Onboarding" tab so managers and HR can see the specific checklist for that individual.

## Data Flow
1. **Triggering Onboarding:** When HR clicks "Start Onboarding" in the dashboard, an `onboarding.start` tRPC mutation fires. 
2. **Task Instantiation:** The backend reads the selected `OnboardingTemplate`'s JSON `tasks` array and bulk-creates actual `OnboardingTask` rows in Postgres, linked to the `employeeId`.
3. **Dynamic Assignment:** We'll build a helper to resolve assignees on the fly. If `assigneeType === 'MANAGER'`, it looks up the new hire's `managerId` and sets `assigneeId`. If `EMPLOYEE`, it assigns to the new hire.
4. **Fetching Tasks:** The global `TasksPopover` calls an `onboarding.myTasks` query. This filters `OnboardingTask` rows where `assigneeId` matches the current user's session ID and `status` is 'PENDING'.

## Error Handling & Edge Cases
1. **Fallback Assignment:** If a template says "assign to Manager", but the new hire doesn't have a manager set yet, we won't crash. The task will gracefully fall back to an "Unassigned" or HR Admin bucket.
2. **Optimistic Updates:** Checking a box in the UI will instantly mark the task as done using React Query's optimistic updates. If the server fails (e.g., network drop), it reverts locally and shows a toast error.
3. **Zod Validation:** All API endpoints will use strict Zod schemas to ensure we never save a task without a valid `assigneeType` or title.

## Testing Strategy
1. **Unit Tests (TRPC Routers)**
   - We'll write isolated tests for `onboarding.router.ts` by mocking Prisma (`prismaMock`). 
   - **Key Focus:** The task assignee resolution logic (e.g., asserting that if an employee has `managerId: 'abc'`, a 'MANAGER' task correctly gets `assigneeId: 'abc'`).
   - We'll test the error fallback (if `managerId` is null, it falls back gracefully).
2. **Component Tests (React Testing Library)**
   - We'll test the global `TasksPopover` UI component to ensure it correctly displays the "badge count" of pending tasks.
   - We'll simulate a user clicking "Complete" and assert the optimistic UI update works before the mock mutation resolves.
3. **Integration / Session Flow Tests**
   - Using the existing `tests/unit/auth/` patterns, we'll mock `next-auth` sessions for three different roles: an HR Admin, a Manager, and a New Hire. 
   - We'll assert that each role only sees `OnboardingTask` records where `assigneeId` matches their mocked session.
