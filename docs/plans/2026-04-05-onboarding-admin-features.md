# Onboarding Admin Features Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the "Add Task" and "Start Onboarding" flows for the HR Admin dashboard to move from mock data to a functional system.

**Architecture:** We'll add new tRPC mutations for starting onboarding and creating tasks. The HR Admin UI will be updated to fetch real data and provide interactive forms for these operations.

**Tech Stack:** Next.js App Router, tRPC, Prisma, Tailwind CSS, Vitest.

---

### Task 1: Add Onboarding Mutations to tRPC Router

**Files:**
- Modify: `src/server/routers/onboarding.ts`
- Test: `tests/unit/routers/onboarding.router.test.ts`

**Step 1: Write the failing test for `createTask` and `start`**

```typescript
// tests/unit/routers/onboarding.router.test.ts
// ... existing imports ...

// Add tests for start and createTask
describe('Onboarding Router - Admin', () => {
  it('should create a manual task', async () => {
    const caller = appRouter.createCaller({ 
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } } 
    } as any);
    
    // This will fail initially because mutations aren't defined
    const result = await caller.onboarding.createTask({
      employeeId: 'emp-1',
      title: 'Manual Task',
      assigneeType: 'HR',
      assigneeId: 'admin-1'
    });
    expect(result.title).toBe('Manual Task');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routers/onboarding.router.test.ts`
Expected: FAIL (mutations undefined)

**Step 3: Implement `createTask` and `start` mutations**

```typescript
// src/server/routers/onboarding.ts
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const onboardingRouter = router({
  // ... existing myTasks ...

  createTask: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      assigneeType: z.string(),
      assigneeId: z.string().optional(),
      dueDate: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.onboardingTask.create({
        data: input,
      });
    }),

  start: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      templateId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.onboardingTemplate.findUnique({
        where: { id: input.templateId }
      });
      if (!template) throw new TRPCError({ code: 'NOT_FOUND' });
      
      const taskTitles = JSON.parse(template.tasks) as string[];
      const tasks = await ctx.db.onboardingTask.createMany({
        data: taskTitles.map(title => ({
          employeeId: input.employeeId,
          templateId: input.templateId,
          title,
          assigneeType: 'HR', // Default for now
          status: 'PENDING',
        }))
      });
      return tasks;
    }),
    
  listNewHires: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.employee.findMany({
      where: { 
        companyId: ctx.user.companyId,
        status: 'ACTIVE' // Simplified for MVP
      },
      include: {
        onboardingTasks: true
      }
    });
  }),
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routers/onboarding.router.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/routers/onboarding.ts tests/unit/routers/onboarding.router.test.ts
git commit -m "feat: add onboarding mutations and listNewHires query"
```

---

### Task 2: Update Onboarding Page to use Real Data

**Files:**
- Modify: `src/app/(dashboard)/onboarding/page.tsx`
- Test: `tests/unit/components/onboarding-page.test.tsx` (Create)

**Step 1: Write the failing test**

```tsx
// tests/unit/components/onboarding-page.test.tsx
import { render, screen } from '@testing-library/react';
import OnboardingPage from '../../../src/app/(dashboard)/onboarding/page';
import { trpc } from '../../../src/lib/trpc';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../../src/lib/trpc', () => ({
  trpc: {
    onboarding: {
      listNewHires: {
        useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }),
      }
    }
  }
}));

describe('OnboardingPage', () => {
  it('renders "No new hires" when data is empty', () => {
    render(<OnboardingPage />);
    expect(screen.getByText(/No new hires/i)).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/onboarding-page.test.tsx`
Expected: FAIL (Static mock data is still present)

**Step 3: Implement dynamic data fetching in OnboardingPage**

```tsx
// src/app/(dashboard)/onboarding/page.tsx
"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlus, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function OnboardingPage() {
  const { data: employees, isLoading } = trpc.onboarding.listNewHires.useQuery();

  if (isLoading) return <div>Loading...</div>;
  if (!employees || employees.length === 0) return <div>No new hires found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <Button><UserPlus size={16} className="mr-2" />New Hire</Button>
      </div>
      <div className="space-y-4">
        {employees.map(h => {
          const completed = h.onboardingTasks.filter(t => t.status === 'COMPLETED').length;
          const total = h.onboardingTasks.length;
          const progress = total > 0 ? (completed / total) * 100 : 0;

          return (
            <Card key={h.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">{h.firstName} {h.lastName}</p>
                    <p className="text-sm text-gray-500">Starts {h.startDate.toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={progress >= 80 ? "success" : "warning"}>
                      {completed}/{total} tasks
                    </Badge>
                    <Button variant="ghost" size="sm"><Plus size={14} /></Button>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className="h-2 bg-primary-500 rounded-full" style={{ width: progress+"%" }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/onboarding-page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/(dashboard)/onboarding/page.tsx tests/unit/components/onboarding-page.test.tsx
git commit -m "feat: connect onboarding page to real tRPC data"
```
