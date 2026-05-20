# Wire Onboarding Module Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A unified Task Dashboard to handle new hire checklists, mimicking HiBob's core HR lifecycle feature.

**Architecture:** We'll build a global `TasksPopover` component for all users and a `/onboarding` dashboard for HR admins. The backend will use `onboarding.start` mutation to instantiate tasks from `OnboardingTemplate`s.

**Tech Stack:** Next.js App Router, tRPC, Prisma, Tailwind CSS, Vitest, React Testing Library.

---

### Task 1: Create the Onboarding tRPC Router

**Files:**
- Create: `src/server/routers/onboarding.ts`
- Modify: `src/server/routers/_app.ts` (to include the new router)
- Test: `tests/unit/routers/onboarding.router.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/routers/onboarding.router.test.ts
import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../../src/server/routers/_app';

vi.mock('../../../src/lib/db', () => ({
  db: {
    onboardingTask: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('Onboarding Router', () => {
  it('should fetch my tasks', async () => {
    const caller = appRouter.createCaller({ session: { user: { id: 'user-1' } } } as any);
    const result = await caller.onboarding.myTasks();
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routers/onboarding.router.test.ts`
Expected: FAIL with "onboarding is not a property of caller"

**Step 3: Write minimal implementation**

```typescript
// src/server/routers/onboarding.ts
import { router, protectedProcedure } from '../trpc';
import { db } from '../../lib/db';

export const onboardingRouter = router({
  myTasks: protectedProcedure.query(async ({ ctx }) => {
    return db.onboardingTask.findMany({
      where: { assigneeId: ctx.session.user.id, status: 'PENDING' },
    });
  }),
});
```

```typescript
// src/server/routers/_app.ts (Add this block)
import { onboardingRouter } from './onboarding';
// ... inside appRouter ...
  onboarding: onboardingRouter,
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routers/onboarding.router.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/routers/onboarding.ts src/server/routers/_app.ts tests/unit/routers/onboarding.router.test.ts
git commit -m "feat: add onboarding tRPC router with myTasks query"
```

---

### Task 2: Create the Global Tasks Popover Component

**Files:**
- Create: `src/components/layout/tasks-popover.tsx`
- Modify: `src/components/layout/header.tsx`
- Test: `tests/unit/components/tasks-popover.test.tsx`

**Step 1: Write the failing test**

```tsx
// tests/unit/components/tasks-popover.test.tsx
import { render, screen } from '@testing-library/react';
import { TasksPopover } from '../../../src/components/layout/tasks-popover';
import { trpc } from '../../../src/lib/trpc';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../../src/lib/trpc', () => ({
  trpc: {
    onboarding: {
      myTasks: {
        useQuery: vi.fn().mockReturnValue({ data: [{ id: '1', title: 'Task 1' }] }),
      }
    }
  }
}));

describe('TasksPopover', () => {
  it('renders a task from the trpc query', () => {
    render(<TasksPopover />);
    expect(screen.getByText('Task 1')).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/tasks-popover.test.tsx`
Expected: FAIL with "TasksPopover is not defined"

**Step 3: Write minimal implementation**

```tsx
// src/components/layout/tasks-popover.tsx
import { trpc } from '../../lib/trpc';

export function TasksPopover() {
  const { data: tasks } = trpc.onboarding.myTasks.useQuery();
  
  if (!tasks || tasks.length === 0) return <div>No tasks</div>;
  
  return (
    <div>
      {tasks.map(task => <div key={task.id}>{task.title}</div>)}
    </div>
  );
}
```

```tsx
// src/components/layout/header.tsx (Add to Header)
import { TasksPopover } from './tasks-popover';
// inside render...
<TasksPopover />
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/tasks-popover.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/layout/tasks-popover.tsx src/components/layout/header.tsx tests/unit/components/tasks-popover.test.tsx
git commit -m "feat: add global TasksPopover component"
```