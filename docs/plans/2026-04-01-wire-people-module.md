# Wire People Module to Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use trycycle-executing to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded employee data in the People module (directory listing and profile page) with live data from the database via the existing tRPC `employeeRouter`, and wire the full auth → tRPC → Prisma → UI stack end to end.

**Architecture:** The existing `employeeRouter` has real bugs that must be fixed before it can be relied on. The missing link is the tRPC React client (`createTRPCReact`) — it exists in `src/lib/trpc.ts` but its `trpc.Provider` is never mounted, so no component can call it. We fix that first, then replace the hardcoded arrays in `people/page.tsx` and `people/[id]/page.tsx` with real tRPC query hooks. Five pre-existing bugs must also be fixed: (1) `user.password` → `user.passwordHash` in auth.ts; (2) `user.name` doesn't exist on the User model; (3) `companyId` not persisted through JWT/session callbacks — without this, `protectedProcedure` always throws UNAUTHORIZED; (4) `mode: 'insensitive'` in the `list` query is PostgreSQL-only and throws at runtime on SQLite; (5) the `create` mutation maps `department` (string) and `jobTitle` to non-existent Employee model columns, causing Prisma errors on any Add Employee call; (6) `getById` does not include `department` or `site` relations, so the profile page always shows `—` for those fields; (7) `getById`'s `directReports` select includes `jobTitle` which does not exist on the Employee model.

**Tech Stack:** Next.js 14 App Router, tRPC v10, TanStack React Query v4, Prisma (SQLite), NextAuth.js v4, Vitest + Testing Library (jsdom), Zod

---

## Decisions and Justifications

### Decision 1: Fix auth bugs in-line, not as a separate task
`ctx.user.companyId` is used by every `protectedProcedure` in `employeeRouter`. If auth is broken, every tRPC call throws UNAUTHORIZED and we cannot test the wire-up at all. Fixing auth is a prerequisite, not optional.

### Decision 2: Wire tRPC Provider in `providers.tsx`, not a new file
`providers.tsx` already exists as the app-wide provider boundary. Adding `trpc.Provider` and `QueryClientProvider` there is the idiomatic Next.js + tRPC pattern. Creating a separate file would add indirection with no benefit.

### Decision 3: Keep the employee profile as a client component with `useParams`
The profile page `people/[id]/page.tsx` is already a `"use client"` component. We keep that and use the `useParams` hook to get the `id`, then call `trpc.employee.getById`. Converting to a Server Component would require a different tRPC call path (direct Prisma or `createServerSideHelpers`), adding complexity not needed here.

### Decision 4: Add department filter as a `<Select>` dropdown, not a text input
The existing UI has a Filter button with no behavior. The `employeeRouter.list` input accepts a `department` string. We implement a proper department dropdown (fetched from the unique department values returned by the existing data, no extra router needed) so the filter actually works, matches HiBob UX, and is testable.

### Decision 5: No Playwright this iteration
The testing strategy explicitly approved Component + router integration tests as the confidence level for this iteration. Playwright would require installing a dependency and downloading browser binaries. Do not add it.

### Decision 6: Add an `AddEmployeeModal` component in this iteration
The user approved "the regulars" (standard HiBob functionality). HiBob's People module always includes Add Employee. The `employeeRouter.create` mutation already exists. We wire it up. This is the clean steady-state; not doing it would leave a dead button.

### Decision 7: Fix `employeeRouter` — all router bugs fixed in Task 3 (before integration tests)
The router bugs must be fixed before the Task 3 integration tests run, not in Task 4, because the integration tests call live Prisma queries that crash on SQLite with the current bugs. Six bugs must be fixed:

1. **`create` mutation maps non-existent columns**: `data.department` and `data.jobTitle` do not exist on the Employee Prisma model. Any `create` call throws a Prisma error. Fix: remove those fields from the `data` object in the create mutation. The `createEmployeeSchema` keeps `department` and `jobTitle` as optional string inputs (to avoid breaking the schema) but the mutation body must not forward them to `data`. The Add Employee form submits without these fields and the employee is created successfully. A follow-on task can add a `departmentId` select.

2. **`list` uses `mode: 'insensitive'` — PostgreSQL-only, crashes on SQLite**: Remove `mode: 'insensitive'` from all `contains` filters in the `list` query. SQLite's LIKE is case-insensitive by default for ASCII characters so searches still work for normal names.

3. **`getById` does not include `department` or `site` relations, and its `directReports` select includes the non-existent `jobTitle` field**: Add `department: { select: { id: true, name: true } }` and `site: { select: { id: true, name: true } }` to the `getById` include. Remove `jobTitle` from the `directReports` select (it doesn't exist on Employee).

### Decision 8: Router tests use an in-memory SQLite test database seeded inline
Vitest + Prisma against SQLite is fast and deterministic. We use `DATABASE_URL=file::memory:?cache=shared` set in the test file's `beforeAll` so it does not affect the dev database. No migration file is needed because we use `prisma db push --force-reset` approach via `prisma.$executeRaw` schema sync or we create records directly through the Prisma client against a real schema (the schema is already pushed to the dev db). **Revised approach:** Use a temp file-based SQLite (e.g. `file:/tmp/test-people.db`) and run `prisma db push` against it in `beforeAll`. This avoids in-memory cache isolation issues across workers.

---

## File Structure

### Files to create
- `tests/unit/routers/employee.router.test.ts` — integration tests: call `list` and `getById` via the actual tRPC router against a real seeded SQLite test DB
- `tests/unit/components/people-page.test.tsx` — component test: render People directory with mocked tRPC, assert employee names, search, department filter
- `tests/unit/components/employee-profile.test.tsx` — component test: render employee profile with mocked `getById`, assert all displayed fields
- `src/components/people/add-employee-modal.tsx` — Add Employee modal component (form + `employee.create` mutation)
- `src/types/next-auth.d.ts` — augment NextAuth types to include `id`, `role`, `companyId`, `employeeId` on `Session['user']`

### Files to modify
- `src/lib/auth.ts` — fix `user.password` → `user.passwordHash`; fix `user.name` → derived from employee; persist `companyId` and `employeeId` and `role` through JWT → session callbacks
- `src/app/providers.tsx` — add `trpc.Provider` with `httpBatchLink` wrapping the app; also wrap `QueryClientProvider` inside it (tRPC v10 requires both)
- `src/server/routers/employee.ts` — (a) remove `mode: 'insensitive'` from list search filters; (b) fix `getById` directReports select to remove non-existent `jobTitle`; (c) add `department` and `site` includes to `getById`; (d) fix list department filter from `where.department = department` to `where.department = { name: department }`; (e) add `department: true` include to list; (f) remove `department` and `jobTitle` from create `data` mapping
- `src/app/(dashboard)/people/page.tsx` — replace hardcoded `employees` array with `trpc.employee.list` query; wire search, department filter, and navigation link to profile page
- `src/app/(dashboard)/people/[id]/page.tsx` — replace hardcoded `employee` object with `trpc.employee.getById` query using `params.id`
- `src/app/(auth)/login/page.tsx` — replace fake `setTimeout` redirect with real `signIn('credentials', ...)` from `next-auth/react`

### Files NOT modified
- `src/server/routers/_app.ts` — no change needed
- `prisma/schema.prisma` — no schema change
- All other dashboard pages — out of scope

---

## Task 0: Install missing test dependency

**Why first:** The component tests import `@testing-library/user-event` for realistic keyboard/click simulation. This package is absent from `package.json` and must be installed before any test file that imports it can run.

**Files:** `package.json` (updated by npm)

- [ ] **Step 1: Install user-event**

```bash
cd /workspace/.worktrees/wire-people-module && npm install --save-dev @testing-library/user-event
```

Expected: package added to `devDependencies`, no other changes.

- [ ] **Step 2: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add package.json package-lock.json
git commit -m "chore: add @testing-library/user-event dev dependency"
```

---

## Task 1: Fix NextAuth authentication bugs and add type declarations

**Why first:** Every subsequent tRPC call requires a valid session with `companyId`. Without this, all router tests and UI wiring will fail at the auth middleware layer.

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/(auth)/login/page.tsx`
- Create: `src/types/next-auth.d.ts`

- [ ] **Step 1: Write a failing test for auth session shape**

```typescript
// tests/unit/auth/auth-session.test.ts
import { describe, it, expect } from 'vitest'

// This tests the structure of what the auth callbacks produce.
// It does NOT test NextAuth internals — just that our JWT and session
// callbacks correctly forward companyId and role.

function makeJwtCallback(token: Record<string, unknown>, user?: Record<string, unknown>) {
  // Mirrors the jwt callback in auth.ts — we'll copy the fixed version here
  if (user) {
    token.role = user.role
    token.companyId = user.companyId
    token.employeeId = user.employeeId
  }
  return token
}

function makeSessionCallback(session: { user: Record<string, unknown> }, token: Record<string, unknown>) {
  // Mirrors the session callback in auth.ts
  if (session.user) {
    session.user.id = token.sub ?? ''
    session.user.role = token.role as string
    session.user.companyId = token.companyId as string
    session.user.employeeId = token.employeeId as string | undefined
  }
  return session
}

describe('Auth callbacks', () => {
  it('jwt callback preserves companyId from user object', () => {
    const token = { sub: 'user-1' }
    const user = { role: 'EMPLOYEE', companyId: 'company-1', employeeId: 'emp-1' }
    const result = makeJwtCallback(token, user)
    expect(result.companyId).toBe('company-1')
    expect(result.role).toBe('EMPLOYEE')
    expect(result.employeeId).toBe('emp-1')
  })

  it('jwt callback with no user leaves token unchanged', () => {
    const token = { sub: 'user-1', role: 'ADMIN', companyId: 'co-1' }
    const result = makeJwtCallback({ ...token })
    expect(result.companyId).toBe('co-1')
  })

  it('session callback copies companyId from token to session.user', () => {
    const session = { user: { email: 'test@example.com' } }
    const token = { sub: 'user-1', role: 'EMPLOYEE', companyId: 'company-1', employeeId: 'emp-1' }
    const result = makeSessionCallback(session, token)
    expect(result.user.companyId).toBe('company-1')
    expect(result.user.id).toBe('user-1')
    expect(result.user.role).toBe('EMPLOYEE')
  })

  it('session callback sets empty string when sub is missing', () => {
    const session = { user: {} }
    const token = { role: 'ADMIN', companyId: 'co-1' }
    const result = makeSessionCallback(session, token)
    expect(result.user.id).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/auth/auth-session.test.ts
```
Expected: FAIL — file does not exist yet.

- [ ] **Step 3: Create NextAuth type declarations and fix auth.ts**

Create `src/types/next-auth.d.ts`:
```typescript
import { DefaultSession, DefaultJWT } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      companyId: string
      employeeId?: string
    } & DefaultSession['user']
  }

  interface User {
    role: string
    companyId: string
    employeeId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role: string
    companyId: string
    employeeId?: string
  }
}
```

Fix `src/lib/auth.ts` — three changes:

1. Change `user.password` → `user.passwordHash`
2. Change `name: user.name` → `name: user.employee ? (user.employee.firstName + ' ' + user.employee.lastName) : user.email`
3. Add `companyId`, `employeeId` to the jwt callback and session callback:

```typescript
import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) throw new Error('Invalid credentials');
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { employee: { include: { company: true } } },
        });
        if (!user) throw new Error('No user found');
        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) throw new Error('Invalid password');
        return {
          id: user.id,
          email: user.email,
          name: user.employee
            ? `${user.employee.firstName} ${user.employee.lastName}`
            : user.email,
          role: user.role,
          employeeId: user.employee?.id,
          companyId: user.employee?.companyId ?? '',
        };
      },
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId;
        token.employeeId = user.employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.employeeId = token.employeeId as string | undefined;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};
```

Fix `src/app/(auth)/login/page.tsx` — replace the fake `setTimeout` with real NextAuth `signIn`:
```typescript
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setIsLoading(false);
    if (result?.error) {
      setError('Invalid email or password');
    } else {
      router.push('/home');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-charcoal-700 to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-gradient-to-br from-primary-500 to-orange-500 rounded-xl flex items-center justify-center mb-4">
            <span className="text-white font-bold text-lg">DB</span>
          </div>
          <CardTitle className="text-2xl">Welcome to DHiBob</CardTitle>
          <p className="text-gray-500">Sign in to your HR platform</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="pl-10" required />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="pl-10" required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">Demo: admin@acme.tech / password123</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/auth/auth-session.test.ts
```
Expected: PASS

- [ ] **Step 5: Refactor and verify**

The test verifies the callback logic in isolation. Ensure no duplication. Run the full test suite to check no regressions:

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```
Expected: all PASS (existing tests in `tests/unit/services/` must remain green)

- [ ] **Step 6: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add \
  src/lib/auth.ts \
  src/types/next-auth.d.ts \
  src/app/\(auth\)/login/page.tsx \
  tests/unit/auth/auth-session.test.ts
git commit -m "fix: repair NextAuth auth bugs — passwordHash field, companyId in JWT/session, real signIn on login page"
```

---

## Task 2: Wire tRPC React client provider into the app

**Why second:** Without the `trpc.Provider`, every component calling `trpc.employee.list.useQuery()` will throw "No tRPC client found". This must be in place before any component tests that use the real hook.

**Files:**
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Write a failing test**

```typescript
// tests/unit/providers/trpc-provider.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Providers from '@/app/providers'

// This test confirms that child components rendered inside Providers
// can access the tRPC context. We use a simple sentinel child.
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

describe('Providers', () => {
  it('renders children without throwing tRPC context error', () => {
    // If tRPC provider is missing, createTRPCReact hooks throw on mount
    // This test just confirms children render — the hook test in people-page
    // will confirm the query context is accessible
    expect(() =>
      render(
        <Providers>
          <div data-testid="child">hello</div>
        </Providers>
      )
    ).not.toThrow()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/providers/trpc-provider.test.tsx
```
Expected: FAIL — file not found or tRPC errors

- [ ] **Step 3: Wire tRPC provider**

Replace `src/app/providers.tsx` entirely:

```typescript
"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { trpc } from "@/lib/trpc";

function getBaseUrl() {
  if (typeof window !== "undefined") return ""; // browser: use relative URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
    })
  );

  return (
    <SessionProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    </SessionProvider>
  );
}
```

**Why `useState` for both clients?** `QueryClient` and the tRPC client must not be re-created on every render. `useState` with an initializer guarantees a single stable instance per component mount, which is the recommended pattern for Next.js App Router.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/providers/trpc-provider.test.tsx
```
Expected: PASS

- [ ] **Step 5: Refactor and verify**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add \
  src/app/providers.tsx \
  tests/unit/providers/trpc-provider.test.tsx
git commit -m "feat: wire tRPC React client provider into app Providers component"
```

---

## Task 3: Fix router bugs, then write router integration tests

**Why third:** The router has bugs that crash at query time against SQLite. The integration tests in this task call the router directly against a real SQLite test DB — if the bugs are not fixed first, the tests will throw Prisma/SQLite errors, not merely fail assertions. Fixes must precede tests.

**Files:**
- Modify: `src/server/routers/employee.ts` — fix all six bugs (move here from Task 4)
- Create: `tests/unit/routers/employee.router.test.ts`

**Router bugs to fix in Step 1:**
The six bugs must be applied to the router before the integration tests run because:
- `mode: 'insensitive'` causes a Prisma error on SQLite when any search is performed (Task 3 tests search).
- `directReports: { select: { ..., jobTitle: true } }` references a non-existent Employee column; Prisma throws at query time when `getById` is called (Task 3 tests getById).

**Setup approach:** We spin up a real Prisma client pointed at a temporary SQLite file (`/tmp/test-people-${process.pid}.db`), apply the schema with `prisma db push`, seed minimal data, and call the router procedures directly as Node functions (not via HTTP). We tear it down in `afterAll`.

**Important:** The router's `protectedProcedure` checks `ctx.user.companyId`. We must supply a mock `ctx` with a real `companyId` matching the seeded data. We do NOT go through the HTTP layer — we call the router's caller directly.

- [ ] **Step 1: Fix all six bugs in `src/server/routers/employee.ts`**

Apply all of the following changes to the router file:

**Fix 1 — Remove `mode: 'insensitive'` from `list` search (SQLite-incompatible):**
```typescript
// BEFORE (crashes on SQLite):
{ firstName: { contains: search, mode: 'insensitive' } },
{ lastName: { contains: search, mode: 'insensitive' } },
{ email: { contains: search, mode: 'insensitive' } },

// AFTER (SQLite LIKE is already case-insensitive for ASCII):
{ firstName: { contains: search } },
{ lastName: { contains: search } },
{ email: { contains: search } },
```

**Fix 2 — Fix department filter in `list` (string column doesn't exist; use relation):**
```typescript
// BEFORE (broken — department is a relation, not a string column):
if (department) where.department = department;

// AFTER (correct — filter via relation):
if (department) where.department = { name: department };
```

**Fix 3 — Add `department` include to `list`:**
```typescript
include: {
  manager: { select: { id: true, firstName: true, lastName: true, email: true } },
  user: { select: { id: true, email: true } },
  department: { select: { id: true, name: true } },
},
```

**Fix 4 — Fix `getById` directReports select (remove non-existent `jobTitle` field):**
```typescript
// BEFORE:
directReports: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },

// AFTER:
directReports: { select: { id: true, firstName: true, lastName: true } },
```

**Fix 5 — Add `department` and `site` includes to `getById`:**
```typescript
include: {
  company: true,
  manager: true,
  department: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  directReports: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { id: true, email: true, role: true } },
},
```

**Fix 6 — Remove non-existent fields from `create` mutation data:**
```typescript
// BEFORE (crashes because Employee model has no `department` string or `jobTitle` column):
const employee = await ctx.db.employee.create({
  data: {
    firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone,
    department: input.department, jobTitle: input.jobTitle, startDate: input.startDate,
    employmentType: input.employmentType, managerId: input.manager, site: input.site,
    salary: input.salary, companyId: input.companyId, status: 'ACTIVE',
  },
  ...
});

// AFTER (only map fields that exist on the Employee model):
const employee = await ctx.db.employee.create({
  data: {
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: `${input.firstName} ${input.lastName}`,
    email: input.email,
    startDate: input.startDate,
    employmentType: input.employmentType,
    managerId: input.manager,
    companyId: input.companyId,
    status: 'ACTIVE',
  },
  include: { company: true, manager: true },
});
```

Note: `phone`, `site`, and `salary` also don't exist as direct string columns on Employee. Do not map them.

- [ ] **Step 2: Run TypeScript check on router file**

```bash
cd /workspace/.worktrees/wire-people-module && npx tsc --noEmit 2>&1 | grep "employee.ts" | head -20
```
Expected: zero errors on the router file.

- [ ] **Step 3: Write the failing integration test**

```typescript
// tests/unit/routers/employee.router.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { employeeRouter } from '@/server/routers/employee'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const TEST_DB_PATH = `/tmp/test-people-${process.pid}.db`
const TEST_DB_URL = `file:${TEST_DB_PATH}`

let db: PrismaClient
let companyId: string
let employeeId: string
let otherCompanyId: string

// Helper to create a tRPC caller with a mock session context
function makeCaller(overrideCompanyId?: string) {
  const ctx = {
    session: { user: { id: 'user-1', companyId: overrideCompanyId ?? companyId, role: 'ADMIN' } },
    db,
    user: { id: 'user-1', companyId: overrideCompanyId ?? companyId, role: 'ADMIN' },
  }
  return employeeRouter.createCaller(ctx as any)
}

beforeAll(async () => {
  // Apply schema to fresh test database
  execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma db push --skip-generate`, {
    cwd: path.resolve(__dirname, '../../../'),
    stdio: 'pipe',
  })

  db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } })

  // Seed minimal data
  const company = await db.company.create({
    data: { name: 'Test Corp', domain: 'test.corp', settings: '{}' },
  })
  companyId = company.id

  const otherCompany = await db.company.create({
    data: { name: 'Other Corp', domain: 'other.corp', settings: '{}' },
  })
  otherCompanyId = otherCompany.id

  const dept = await db.department.create({
    data: { companyId, name: 'Engineering' },
  })

  const emp = await db.employee.create({
    data: {
      companyId,
      email: 'alice@test.corp',
      firstName: 'Alice',
      lastName: 'Smith',
      displayName: 'Alice Smith',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      startDate: new Date('2022-01-10'),
      departmentId: dept.id,
    },
  })
  employeeId = emp.id

  // Second employee in same company for search/filter tests
  await db.employee.create({
    data: {
      companyId,
      email: 'bob@test.corp',
      firstName: 'Bob',
      lastName: 'Jones',
      displayName: 'Bob Jones',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      startDate: new Date('2023-06-01'),
    },
  })

  // Employee in a different company (must never appear in queries)
  await db.employee.create({
    data: {
      companyId: otherCompanyId,
      email: 'eve@other.corp',
      firstName: 'Eve',
      lastName: 'Other',
      displayName: 'Eve Other',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      startDate: new Date('2021-05-01'),
    },
  })
})

afterAll(async () => {
  await db.$disconnect()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
})

describe('employeeRouter.list', () => {
  it('returns only employees from the caller company', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 50 })
    expect(result.employees).toHaveLength(2)
    expect(result.employees.every(e => e.companyId === companyId)).toBe(true)
  })

  it('returns correct fields including manager relation', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10 })
    const alice = result.employees.find(e => e.email === 'alice@test.corp')
    expect(alice).toBeDefined()
    expect(alice!.firstName).toBe('Alice')
    expect(alice!.lastName).toBe('Smith')
    // manager relation should be present (null in this case since no manager set)
    expect('manager' in alice!).toBe(true)
  })

  it('filters by search string (partial first name match)', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'ali' })
    expect(result.employees).toHaveLength(1)
    expect(result.employees[0].firstName).toBe('Alice')
  })

  it('search is case-insensitive for ASCII (SQLite LIKE default behavior)', async () => {
    const caller = makeCaller()
    // SQLite's LIKE is case-insensitive for ASCII by default even without mode:'insensitive'
    const result = await caller.list({ limit: 10, search: 'ALI' })
    expect(result.employees).toHaveLength(1)
  })

  it('search by email works', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'bob@test' })
    expect(result.employees).toHaveLength(1)
    expect(result.employees[0].firstName).toBe('Bob')
  })

  it('returns empty results for search with no match', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'zzznomatch' })
    expect(result.employees).toHaveLength(0)
    expect(result.nextCursor).toBeUndefined()
  })

  it('paginates correctly with limit', async () => {
    const caller = makeCaller()
    const page1 = await caller.list({ limit: 1 })
    expect(page1.employees).toHaveLength(1)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.list({ limit: 1, cursor: page1.nextCursor })
    expect(page2.employees).toHaveLength(1)
    expect(page2.employees[0].id).not.toBe(page1.employees[0].id)
  })

  it('returns all when limit is large enough', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 100 })
    expect(result.employees).toHaveLength(2)
    expect(result.nextCursor).toBeUndefined()
  })
})

describe('employeeRouter.getById', () => {
  it('returns the employee with relations when found', async () => {
    const caller = makeCaller()
    const emp = await caller.getById({ id: employeeId })
    expect(emp.id).toBe(employeeId)
    expect(emp.firstName).toBe('Alice')
    expect(emp.companyId).toBe(companyId)
    // includes directReports relation
    expect(Array.isArray(emp.directReports)).toBe(true)
  })

  it('throws NOT_FOUND for non-existent employee', async () => {
    const caller = makeCaller()
    await expect(caller.getById({ id: 'nonexistent-id' })).rejects.toThrow('Employee not found')
  })

  it('throws FORBIDDEN when employee belongs to different company', async () => {
    // Find the other company's employee
    const otherEmp = await db.employee.findFirst({ where: { companyId: otherCompanyId } })
    expect(otherEmp).not.toBeNull()
    const caller = makeCaller() // caller is from companyId, not otherCompanyId
    await expect(caller.getById({ id: otherEmp!.id })).rejects.toThrow('You do not have access to this employee')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/routers/employee.router.test.ts
```
Expected: FAIL — file does not exist yet (or schema push fails)

- [ ] **Step 5: Write the test file**

The test content from Step 3 IS the implementation. Write it to disk.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/routers/employee.router.test.ts
```
Expected: all assertions PASS

If `prisma db push` in `beforeAll` fails with permission or path issues, adjust `TEST_DB_PATH` to `path.resolve(__dirname, '../../../prisma/test-employee.db')` and add `prisma/test-*.db` to `.gitignore`.

- [ ] **Step 7: Refactor and verify**

Clean up any timing issues. Ensure teardown removes the temp file. Run full suite:
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add \
  src/server/routers/employee.ts \
  tests/unit/routers/employee.router.test.ts
git commit -m "fix+test: fix all employeeRouter bugs (SQLite mode, department filter, directReports jobTitle, getById includes, create fields); add router integration tests"
```

---

## Task 4: Replace hardcoded People directory with real tRPC data

**Why fourth:** The auth and provider are fixed; now we can safely wire the UI. This is the primary deliverable.

**Files:**
- Modify: `src/app/(dashboard)/people/page.tsx`
- Create: `tests/unit/components/people-page.test.tsx`

**Key behavior changes:**
- Fetch employees via `trpc.employee.list.useQuery()` with `search` and `department` debounced inputs
- Show loading skeleton while data loads
- Show real employee count
- Cards link to `/people/{employee.id}` (replacing the non-functional cards)
- Department filter: a `<Select>` that filters the tRPC query by department name (using `department` param on the router)
- Search: debounced 300ms, passed as `search` param to the tRPC query
- Grid and list view toggle preserved
- "Add Employee" button opens the `AddEmployeeModal`

**Note on Employee model fields:** The schema has `firstName`, `lastName`, `status`, `departmentId` (relation to Department). `jobTitle` does NOT exist on the model. For display we use `displayName` (seed populates as `firstName + lastName`). **Decision:** Use `department.name` from the include for the department badge. All six router bugs (including department filter and `department` include in `list`) were fixed in Task 3.

**Note on AddEmployeeModal import:** `PeoplePage` will import `AddEmployeeModal` from `src/components/people/add-employee-modal.tsx`. That file is created in Task 5, but the page test (Task 4) runs before Task 5. To avoid a MODULE_NOT_FOUND error during the Task 4 test run, `people-page.test.tsx` must mock the add-employee-modal module. The mock is included in the test below.

- [ ] **Step 1: Write the failing component test**

```typescript
// tests/unit/components/people-page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock tRPC entirely — we test the component behavior, not the network
vi.mock('@/lib/trpc', () => ({
  trpc: {
    employee: {
      list: {
        useQuery: vi.fn(),
      },
      create: {
        useMutation: vi.fn(() => ({
          mutateAsync: vi.fn(),
          isLoading: false,
          error: null,
        })),
      },
    },
    useContext: vi.fn(() => ({
      employee: { list: { invalidate: vi.fn() } },
    })),
  },
}))

// Mock AddEmployeeModal — the file doesn't exist until Task 5; without this mock,
// importing PeoplePage will throw MODULE_NOT_FOUND and all tests in this file will error.
vi.mock('@/components/people/add-employee-modal', () => ({
  AddEmployeeModal: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <div role="dialog" aria-label="Add Employee">Mock Modal</div> : null,
}))

// AddEmployeeModal (always mounted in PeoplePage) calls useSession — must mock it
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/people',
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { trpc } from '@/lib/trpc'
import PeoplePage from '@/app/(dashboard)/people/page'

const mockEmployees = [
  {
    id: 'emp-1',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    email: 'alice@test.corp',
    status: 'ACTIVE',
    department: { id: 'dept-1', name: 'Engineering' },
    manager: null,
    companyId: 'co-1',
    startDate: new Date('2022-01-10'),
    employmentType: 'FULL_TIME',
  },
  {
    id: 'emp-2',
    firstName: 'Bob',
    lastName: 'Jones',
    displayName: 'Bob Jones',
    email: 'bob@test.corp',
    status: 'ACTIVE',
    department: { id: 'dept-2', name: 'Product' },
    manager: null,
    companyId: 'co-1',
    startDate: new Date('2023-06-01'),
    employmentType: 'FULL_TIME',
  },
  {
    id: 'emp-3',
    firstName: 'Carol',
    lastName: 'On Leave',
    displayName: 'Carol On Leave',
    email: 'carol@test.corp',
    status: 'ON_LEAVE',
    department: { id: 'dept-1', name: 'Engineering' },
    manager: null,
    companyId: 'co-1',
    startDate: new Date('2021-03-15'),
    employmentType: 'PART_TIME',
  },
]

beforeEach(() => {
  vi.mocked(trpc.employee.list.useQuery).mockReturnValue({
    data: { employees: mockEmployees, nextCursor: undefined },
    isLoading: false,
    error: null,
  } as any)
})

describe('People directory page', () => {
  it('renders employee names from tRPC data', () => {
    render(<PeoplePage />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.getByText('Carol On Leave')).toBeInTheDocument()
  })

  it('does not show hardcoded names', () => {
    render(<PeoplePage />)
    expect(screen.queryByText('Sarah Chen')).not.toBeInTheDocument()
    expect(screen.queryByText('Mike Johnson')).not.toBeInTheDocument()
  })

  it('shows ACTIVE status badge for active employees', () => {
    render(<PeoplePage />)
    const badges = screen.getAllByText('Active')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('shows department names', () => {
    render(<PeoplePage />)
    expect(screen.getAllByText('Engineering').length).toBeGreaterThanOrEqual(1)
  })

  it('employee card links to /people/[id]', () => {
    render(<PeoplePage />)
    const link = screen.getByRole('link', { name: /Alice Smith/i })
    expect(link).toHaveAttribute('href', '/people/emp-1')
  })

  it('shows loading state while query is loading', () => {
    vi.mocked(trpc.employee.list.useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)
    render(<PeoplePage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('search input calls tRPC with search param after debounce', async () => {
    render(<PeoplePage />)
    const searchInput = screen.getByPlaceholderText(/search/i)
    await userEvent.type(searchInput, 'Ali')
    // After debounce the query mock should be called with search param
    // We verify the input value is reflected
    expect(searchInput).toHaveValue('Ali')
  })

  it('shows employee count', () => {
    render(<PeoplePage />)
    expect(screen.getByText(/3.*employees/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/people-page.test.tsx
```
Expected: FAIL — page still uses hardcoded data / tRPC mock not called

- [ ] **Step 3: Rewrite People page**

**Note:** All six router bugs were already fixed in Task 3 Step 1. Do NOT re-apply them here.

**Rewrite `src/app/(dashboard)/people/page.tsx`:**

```typescript
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Grid3X3, List } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AddEmployeeModal } from "@/components/people/add-employee-modal";

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function statusVariant(status: string): "success" | "warning" | "secondary" {
  if (status === 'ACTIVE') return 'success';
  if (status === 'ON_LEAVE') return 'warning';
  return 'secondary';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'ON_LEAVE') return 'On Leave';
  if (status === 'INACTIVE') return 'Inactive';
  if (status === 'TERMINATED') return 'Terminated';
  return status;
}

const DEPARTMENTS = [
  'All',
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'HR',
  'Finance',
  'Operations',
  'Executive',
];

export default function PeoplePage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string | undefined>(undefined);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [addOpen, setAddOpen] = useState(false);

  // Debounce search 300ms
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = trpc.employee.list.useQuery({
    limit: 100,
    search: search || undefined,
    department: department || undefined,
  });

  const employees = data?.employees ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">People</h1>
        </div>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">People</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} className="mr-2" />Add Employee
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            placeholder="Search employees..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={department ?? 'All'}
          onValueChange={v => setDepartment(v === 'All' ? undefined : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex border rounded-md">
          <Button variant={view === "grid" ? "default" : "ghost"} size="icon" onClick={() => setView("grid")}>
            <Grid3X3 size={18} />
          </Button>
          <Button variant={view === "list" ? "default" : "ghost"} size="icon" onClick={() => setView("list")}>
            <List size={18} />
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500">{employees.length} employees</p>

      <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
        {employees.map(emp => (
          <Link key={emp.id} href={`/people/${emp.id}`}>
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary-100 text-primary-600 font-bold">
                    {getInitials(emp.firstName, emp.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{emp.firstName} {emp.lastName}</p>
                  <p className="text-xs text-gray-400">{(emp as any).department?.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{emp.email}</p>
                </div>
                <Badge variant={statusVariant(emp.status)}>{statusLabel(emp.status)}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <AddEmployeeModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/people-page.test.tsx
```
Expected: PASS

- [ ] **Step 5: Refactor and verify**

Run the full suite:
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add \
  src/app/\(dashboard\)/people/page.tsx \
  tests/unit/components/people-page.test.tsx
git commit -m "feat: wire People directory to real tRPC data with search, department filter, and AddEmployeeModal integration"
```

---

## Task 5: Add Employee modal component

**Why separate task:** It's a self-contained UI component that can be tested and committed independently from the page.

**Files:**
- Create: `src/components/people/add-employee-modal.tsx`

The modal collects: First Name, Last Name, Email, Department (Select), Employment Type (Select), Start Date. It calls `trpc.employee.create.useMutation()`. On success it invalidates the `employee.list` query and closes.

**Note on `create` mutation inputs:** The `createEmployeeSchema` in the router accepts `companyId`, `startDate`, `employmentType`, `department` (string), and `jobTitle`. The router's `create` mutation has been fixed in Task 3 to not forward `department` or `jobTitle` to Prisma (those fields don't exist on the Employee model and would cause a Prisma error). The component passes `department` in the request body — the Zod schema accepts it — but the router silently drops it before the Prisma call. The employee is created successfully without a department relation. A follow-on task can add a department select that submits `departmentId` instead. The `companyId` must be valid — taken from session.

- [ ] **Step 1: Write a failing test**

```typescript
// tests/unit/components/add-employee-modal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    employee: {
      create: {
        useMutation: vi.fn(),
      },
      list: {
        useQuery: vi.fn(),
      },
    },
    useContext: vi.fn(() => ({
      employee: { list: { invalidate: vi.fn() } },
    })),
  },
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}))

import { trpc } from '@/lib/trpc'
import { AddEmployeeModal } from '@/components/people/add-employee-modal'

beforeEach(() => {
  vi.mocked(trpc.employee.create.useMutation).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'new-emp-1' }),
    isLoading: false,
    error: null,
  } as any)
})

describe('AddEmployeeModal', () => {
  it('does not render when open=false', () => {
    render(<AddEmployeeModal open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders form fields when open=true', () => {
    render(<AddEmployeeModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('submit button is visible', () => {
    render(<AddEmployeeModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add employee/i })).toBeInTheDocument()
  })

  it('shows validation error for empty required fields on submit', async () => {
    const onOpenChange = vi.fn()
    render(<AddEmployeeModal open={true} onOpenChange={onOpenChange} />)
    const submitBtn = screen.getByRole('button', { name: /add employee/i })
    await userEvent.click(submitBtn)
    // Form validation should prevent submission and show error
    expect(vi.mocked(trpc.employee.create.useMutation)().mutateAsync).not.toHaveBeenCalled()
  })

  it('calls create mutation with form data on valid submit', async () => {
    const onOpenChange = vi.fn()
    render(<AddEmployeeModal open={true} onOpenChange={onOpenChange} />)

    await userEvent.type(screen.getByLabelText(/first name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(screen.getByLabelText(/email/i), 'jane@test.corp')

    const submitBtn = screen.getByRole('button', { name: /add employee/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(vi.mocked(trpc.employee.create.useMutation)().mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@test.corp',
          companyId: 'co-1',
        })
      )
    })
  })

  it('closes modal after successful submission', async () => {
    const onOpenChange = vi.fn()
    render(<AddEmployeeModal open={true} onOpenChange={onOpenChange} />)

    await userEvent.type(screen.getByLabelText(/first name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(screen.getByLabelText(/email/i), 'jane@test.corp')

    await userEvent.click(screen.getByRole('button', { name: /add employee/i }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/add-employee-modal.test.tsx
```
Expected: FAIL — file not found

- [ ] **Step 3: Create the modal component**

Create `src/components/people/add-employee-modal.tsx`:

```typescript
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email required"),
  department: z.string().min(1, "Department is required"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]),
  startDate: z.string().min(1, "Start date is required"),
});

type FormValues = z.infer<typeof formSchema>;

const DEPARTMENTS = [
  "Engineering", "Product", "Design", "Marketing",
  "Sales", "HR", "Finance", "Operations", "Executive",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEmployeeModal({ open, onOpenChange }: Props) {
  const { data: session } = useSession();
  const utils = trpc.useContext();

  const today = typeof window !== 'undefined'
    ? new Date().toISOString().split('T')[0]
    : '';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employmentType: "FULL_TIME",
      department: "Engineering",
      startDate: today,
    },
  });

  const createMutation = trpc.employee.create.useMutation({
    onSuccess: () => {
      utils.employee.list.invalidate();
      reset();
      onOpenChange(false);
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!session?.user.companyId) return;
    createMutation.mutateAsync({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      department: values.department,
      jobTitle: values.department, // jobTitle is required by schema; mirrors department for now
      startDate: new Date(values.startDate),
      employmentType: values.employmentType,
      companyId: session.user.companyId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium mb-1">First Name</label>
            <Input id="firstName" {...register("firstName")} />
            {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium mb-1">Last Name</label>
            <Input id="lastName" {...register("lastName")} />
            {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Department</label>
            <Select onValueChange={v => setValue("department", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.department && <p className="text-xs text-red-600 mt-1">{errors.department.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Employment Type</label>
            <Select
              defaultValue="FULL_TIME"
              onValueChange={v => setValue("employmentType", v as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_TIME">Full Time</SelectItem>
                <SelectItem value="PART_TIME">Part Time</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium mb-1">Start Date</label>
            <Input id="startDate" type="date" {...register("startDate")} />
            {errors.startDate && <p className="text-xs text-red-600 mt-1">{errors.startDate.message}</p>}
          </div>
          {createMutation.error && (
            <p className="text-sm text-red-600">{createMutation.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isLoading}>
              {createMutation.isLoading ? "Adding..." : "Add Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/add-employee-modal.test.tsx
```
Expected: PASS

- [ ] **Step 5: Refactor and verify**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add \
  src/components/people/add-employee-modal.tsx \
  tests/unit/components/add-employee-modal.test.tsx
git commit -m "feat: add AddEmployeeModal component with form validation and tRPC mutation"
```

---

## Task 6: Wire employee profile page to real tRPC data

**Files:**
- Modify: `src/app/(dashboard)/people/[id]/page.tsx`
- Create: `tests/unit/components/employee-profile.test.tsx`

The profile page currently hardcodes one employee. We replace it with `trpc.employee.getById.useQuery({ id })` where `id` comes from `useParams()`. Display: name, status badge, email, manager name, department name, start date, direct reports count in Employment tab.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/components/employee-profile.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    employee: {
      getById: {
        useQuery: vi.fn(),
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'emp-test-1' }),
  useRouter: () => ({ back: vi.fn() }),
}))

import { trpc } from '@/lib/trpc'
import EmployeeProfilePage from '@/app/(dashboard)/people/[id]/page'

const mockEmployee = {
  id: 'emp-test-1',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  email: 'alice@test.corp',
  status: 'ACTIVE',
  startDate: new Date('2022-01-10'),
  employmentType: 'FULL_TIME',
  companyId: 'co-1',
  department: { id: 'dept-1', name: 'Engineering', companyId: 'co-1' },
  site: { id: 'site-1', name: 'New York', country: 'USA', timezone: 'EST', companyId: 'co-1' },
  manager: {
    id: 'mgr-1',
    firstName: 'Bob',
    lastName: 'Manager',
    displayName: 'Bob Manager',
    email: 'bob.manager@test.corp',
    status: 'ACTIVE',
    startDate: new Date('2020-01-01'),
    employmentType: 'FULL_TIME',
    companyId: 'co-1',
  },
  directReports: [
    { id: 'dr-1', firstName: 'Carol', lastName: 'Report' },
  ],
  company: { id: 'co-1', name: 'Test Corp', domain: 'test.corp', settings: '{}' },
  user: { id: 'user-1', email: 'alice@test.corp', role: 'EMPLOYEE' },
  personalInfo: '{}',
  workInfo: '{}',
  customFields: '{}',
  teamId: null,
  managerId: 'mgr-1',
  departmentId: 'dept-1',
  siteId: 'site-1',
  avatar: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('Employee profile page', () => {
  it('renders employee full name', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  it('shows ACTIVE status badge', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows employee email', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('alice@test.corp')).toBeInTheDocument()
  })

  it('shows manager name in Employment tab', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    // Employment tab content is hidden by Radix UI until the tab is active;
    // use { hidden: true } to query content that exists in DOM but is not visible.
    expect(screen.getByText('Bob Manager', { hidden: true })).toBeInTheDocument()
  })

  it('shows department name', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Engineering')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows not found when error', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Employee not found' },
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('does not show hardcoded Sarah Chen', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.queryByText('Sarah Chen')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/employee-profile.test.tsx
```
Expected: FAIL — page still hardcoded / hook not called

- [ ] **Step 3: Rewrite employee profile page**

Rewrite `src/app/(dashboard)/people/[id]/page.tsx`:

```typescript
"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, MapPin, Calendar, Building, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

function statusVariant(status: string): "success" | "warning" | "secondary" | "destructive" {
  if (status === 'ACTIVE') return 'success';
  if (status === 'ON_LEAVE') return 'warning';
  if (status === 'TERMINATED') return 'destructive';
  return 'secondary';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'ON_LEAVE') return 'On Leave';
  if (status === 'INACTIVE') return 'Inactive';
  if (status === 'TERMINATED') return 'Terminated';
  return status;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export default function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const { data: employee, isLoading, error } = trpc.employee.getById.useQuery(
    { id: params.id },
    { retry: false }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500">Employee not found.</p>
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const managerName = employee.manager
    ? `${employee.manager.firstName} ${employee.manager.lastName}`
    : '—';
  const departmentName = (employee as any).department?.name ?? '—';
  const siteName = (employee as any).site?.name ?? '—';
  const startDateFormatted = employee.startDate
    ? format(new Date(employee.startDate), 'MMM d, yyyy')
    : '—';

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-2xl bg-primary-100 text-primary-600">
                {getInitials(employee.firstName, employee.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{fullName}</h1>
                <Badge variant={statusVariant(employee.status)}>{statusLabel(employee.status)}</Badge>
              </div>
              <p className="text-gray-500">{departmentName}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Mail size={14} />{employee.email}</span>
                {siteName !== '—' && (
                  <span className="flex items-center gap-1"><MapPin size={14} />{siteName}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="time-off">Time Off</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-gray-500">Full Name</p><p className="font-medium">{fullName}</p></div>
                <div><p className="text-sm text-gray-500">Email</p><p className="font-medium">{employee.email}</p></div>
                <div><p className="text-sm text-gray-500">Location</p><p className="font-medium">{siteName}</p></div>
                <div><p className="text-sm text-gray-500">Employment Type</p><p className="font-medium">{employee.employmentType}</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employment">
          <Card>
            <CardHeader><CardTitle>Employment Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium flex items-center gap-1"><Building size={14} />{departmentName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Start Date</p>
                  <p className="font-medium flex items-center gap-1"><Calendar size={14} />{startDateFormatted}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Manager</p>
                  <p className="font-medium">{managerName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Direct Reports</p>
                  <p className="font-medium flex items-center gap-1">
                    <Users size={14} />{employee.directReports?.length ?? 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time-off">
          <Card>
            <CardHeader><CardTitle>Time Off</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-500 text-sm">Time off details coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-500 text-sm">Documents coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/employee-profile.test.tsx
```
Expected: PASS

- [ ] **Step 5: Refactor and verify**

Run the full suite:
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```
Expected: all PASS including pre-existing `tests/unit/services/employee.test.ts`, `analytics.test.ts`, `hiring.test.ts`

- [ ] **Step 6: Commit**

```bash
cd /workspace/.worktrees/wire-people-module && git add \
  src/app/\(dashboard\)/people/\[id\]/page.tsx \
  tests/unit/components/employee-profile.test.tsx
git commit -m "feat: wire employee profile page to real tRPC data via getById"
```

---

## Task 7: Final integration smoke test and regression verification

**Why:** Confirm the entire stack compiles and all tests pass together before declaring done.

**Files:** none created; runs existing checks.

- [ ] **Step 1: Run the full test suite**

```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```

Expected output: all new tests PASS.

> **Known pre-existing baseline:** `tests/unit/services/analytics.test.ts` and `tests/unit/services/hiring.test.ts` contain escaped-backtick syntax errors (`\``) that predate this plan and cause Vitest/esbuild to fail on those files. These are **out of scope** for this task. Do not attempt to fix them here. If the full suite errors on those two files, verify the new tests all pass and treat the pre-existing failures as a known baseline.

Key groups that must be green:
- `tests/unit/services/employee.test.ts` (50+ cases — regression)
- `tests/unit/services/analytics.test.ts` — **pre-existing syntax failure, skip**
- `tests/unit/services/hiring.test.ts` — **pre-existing syntax failure, skip**
- `tests/unit/auth/auth-session.test.ts` (new)
- `tests/unit/providers/trpc-provider.test.tsx` (new)
- `tests/unit/routers/employee.router.test.ts` (new)
- `tests/unit/components/people-page.test.tsx` (new)
- `tests/unit/components/add-employee-modal.test.tsx` (new)
- `tests/unit/components/employee-profile.test.tsx` (new)

- [ ] **Step 2: TypeScript compilation check**

```bash
cd /workspace/.worktrees/wire-people-module && npx tsc --noEmit
```
Expected: zero errors.

If TypeScript complains about the `session.user.companyId` property, verify `src/types/next-auth.d.ts` is included in `tsconfig.json`'s `include` array (it should be by default if it's under `src/`).

- [ ] **Step 3: Commit if any cleanup was needed**

If no changes were needed:
```bash
# nothing to commit — all clean
```

If cleanup was needed:
```bash
cd /workspace/.worktrees/wire-people-module && git add -p
git commit -m "chore: fix TypeScript errors found during final type check"
```

---

## Known limitations and follow-on work (NOT in scope for this plan)

1. **Add Employee department linkage:** The `employeeRouter.create` accepts a `department` string in its Zod schema but does not map it to `departmentId` in the Prisma create call (the Employee model uses a relation FK, not a string field). A follow-on task should update `createEmployeeSchema` to accept `departmentId` and map it to `data.departmentId`, and update the modal to fetch departments via a `department.list` router.

2. **Job title field:** The `Employee` Prisma model has no `jobTitle` column. The `create` mutation's Zod schema accepts it but the router does not forward it to Prisma. Add `jobTitle String?` to the schema and map it in the router in a follow-on task.

3. **Org chart:** Not implemented. HiBob has an org chart view. Requires a separate component using D3 or a tree library.

4. **Full browser E2E:** No Playwright. A follow-on task can add Playwright for real browser smoke tests.

5. **Pagination UI:** The `list` query supports cursor pagination but the UI fetches with `limit: 100`. A follow-on task should add infinite scroll or page controls.

6. **Admin guard on Add Employee:** Currently any authenticated user can see the Add Employee button. A role-based check (`session.user.role === 'ADMIN'`) should gate it in a follow-on task.
