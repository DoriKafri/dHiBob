# Home Social Hub Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the home dashboard into a personalized, social HiBob-style experience with a central activity feed and personal sidebar widgets.

**Architecture:** We will update the Prisma schema to support manual posts, implement a tRPC aggregator query to merge various event types, and rebuild the Home page with a 70/30 layout split.

**Tech Stack:** Next.js, tRPC, Prisma, Tailwind CSS, Lucide React.

---

### Task 1: Update Prisma Schema & Database

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add `Post` model and relations**

```prisma
// prisma/schema.prisma

model Employee {
  // ... existing fields
  postsCreated   Post[] @relation("AuthorPosts")
  postsTargeted  Post[] @relation("TargetPosts")
}

model Post {
  id          String   @id @default(cuid())
  type        String   @default("SHOUTOUT") // SHOUTOUT, ANNOUNCEMENT
  content     String
  authorId    String
  targetId    String?  // Recipient for shoutouts
  companyId   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  author      Employee @relation("AuthorPosts", fields: [authorId], references: [id], onDelete: Cascade)
  target      Employee? @relation("TargetPosts", fields: [targetId], references: [id], onDelete: SetNull)
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@index([companyId])
  @@index([authorId])
  @@index([targetId])
}
```

**Step 2: Generate Prisma Client**

Run: `npx prisma generate`
Expected: Success

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Post model for social feed"
```

---

### Task 2: Implement Home tRPC Router (Aggregator)

**Files:**
- Create: `src/server/routers/home.ts`
- Modify: `src/server/routers/_app.ts`
- Test: `tests/unit/routers/home.router.test.ts` (Create)

**Step 1: Write the failing test**

```typescript
// tests/unit/routers/home.router.test.ts
import { describe, it, expect } from 'vitest';
import { appRouter } from '../../../src/server/routers/_app';

describe('Home Router', () => {
  it('should fetch merged feed data', async () => {
    const caller = appRouter.createCaller({ 
      session: { user: { id: 'user-1', employeeId: 'emp-1', role: 'EMPLOYEE', companyId: 'company-1' } },
      db: {} as any // Mocked in real test
    } as any);
    const result = await caller.home.getFeed();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
```

**Step 2: Implement `getFeed` query**

The query must fetch:
- New joiners (last 30 days)
- Upcoming birthdays (next 7 days)
- Manual posts (shoutouts)
- Work anniversaries (matching month/day)

**Step 3: Register in `_app.ts`**

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 3: Build Feed Components

**Files:**
- Create: `src/components/home/feed-card.tsx`
- Create: `src/components/home/shoutout-card.tsx`
- Create: `src/components/home/celebration-card.tsx`

**Step 1: Implement `FeedCard` (Main Wrapper)**
**Step 2: Implement variants (NewJoiner, Birthday, Shoutout)**
**Step 3: Commit**

---

### Task 4: Build Sidebar Widgets

**Files:**
- Create: `src/components/home/me-widget.tsx`
- Create: `src/components/home/team-widget.tsx`

**Step 1: Implement `MeWidget` (PTO balances, next holiday)**
**Step 2: Implement `TeamWidget` (Who's In/Out today)**
**Step 3: Commit**

---

### Task 5: Rebuild Home Page Layout

**Files:**
- Modify: `src/app/(dashboard)/home/page.tsx`

**Step 1: Implement 70/30 Responsive Layout**
**Step 2: Integrate `getFeed` query and components**
**Step 3: Integrate Sidebar widgets**
**Step 4: Commit**

---

### Task 6: Final Validation & Polish

**Step 1: Run full test suite**
**Step 2: Manual styling check (HiBob aesthetics, dark mode)**
**Step 3: Commit**
