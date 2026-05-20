# Test Plan: Wire People Module to Real Data

**Implementation plan:** `docs/plans/2026-04-01-wire-people-module.md`
**Date:** 2026-04-01
**Worktree:** `/workspace/.worktrees/wire-people-module`

---

## How to Run

Run all tests (recommended before any commit):
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run
```

Run a single file:
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run <path-to-file>
```

Run with watch mode during development:
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest <path-to-file>
```

TypeScript check (must stay zero errors):
```bash
cd /workspace/.worktrees/wire-people-module && npx tsc --noEmit
```

---

## Test Classification

| Status | Meaning |
|--------|---------|
| REGRESSION | Pre-existing test — must stay green throughout all tasks |
| NEW | Test created as part of this implementation plan — must go green |
| SKIP | Pre-existing file with known syntax errors — excluded from must-pass targets |

---

## File 1: `tests/unit/services/employee.test.ts`

**Classification:** REGRESSION — must stay green

**Already exists.** Do not modify. Run after every task to verify no regressions.

| Test name | Asserts |
|-----------|---------|
| `createEmployee() > should create employee with valid data` | Returns object with correct firstName and status ACTIVE |
| `createEmployee() > should throw error for missing first name` | Throws "First name is required" |
| `createEmployee() > should throw error for missing last name` | Throws "Last name is required" |
| `createEmployee() > should throw error for invalid email` | Throws "Valid email is required" |
| `createEmployee() > should throw error for missing department` | Throws "Department is required" |
| `createEmployee() > should throw error for duplicate email` | Throws "Employee with this email already exists" |
| `createEmployee() > should return employee with generated ID` | id is defined and starts with "emp-" |
| `createEmployee() > should set creation timestamp` | createdAt is instanceof Date |
| `filterEmployees() > should filter by department` | Returns only Engineering employees (length 2) |
| `filterEmployees() > should filter by status` | Returns only ACTIVE employees (length 2) |
| `filterEmployees() > should filter by hire date range` | Returns employees within the given date range |
| `filterEmployees() > should combine multiple filters` | Engineering + ACTIVE returns exactly John |
| `filterEmployees() > should return all when no filters` | Returns all 3 mock employees |
| `filterEmployees() > should return empty for no matches` | Returns empty array for Marketing filter |
| `searchEmployees() > should search by first name` | "John" matches 2 employees (John + Johnson) |
| `searchEmployees() > should search by last name` | "Smith" matches 1 employee |
| `searchEmployees() > should search by email` | "jane" matches 1 employee |
| `searchEmployees() > should be case insensitive` | "JOHN" matches at least 1 employee |
| `searchEmployees() > should return empty for no matches` | "NonExistent" returns empty array |
| `searchEmployees() > should handle partial matches` | "jo" matches multiple employees |
| `paginateResults() > should return first page without cursor` | 10 items, cursor "10", hasMore true |
| `paginateResults() > should return correct page with cursor` | With cursor "10" returns 10 items starting at Item 11 |
| `paginateResults() > should indicate no next page` | With cursor "20" returns 5 items, hasMore false, cursor null |
| `paginateResults() > should handle custom page size` | pageSize 5 returns 5 items and cursor "5" |
| `paginateResults() > should handle small dataset` | 1-item array returns length 1, hasMore false |
| `paginateResults() > should handle empty array` | Empty array returns length 0, hasMore false |
| `terminateEmployee() > should update status to TERMINATED` | Status is "TERMINATED" |
| `terminateEmployee() > should set end date` | endDate matches the provided date |
| `terminateEmployee() > should set termination reason` | terminationReason matches the provided string |
| `terminateEmployee() > should preserve other properties` | firstName and email unchanged |
| `terminateEmployee() > should handle different reasons` | Resignation, Layoff, Retirement each set correctly |
| `Employee validation edge cases > should trim whitespace from name fields` | Does not throw for names with surrounding spaces |
| `Employee validation edge cases > should validate email with plus addressing` | Does not throw for john+tag@example.com |
| `Employee validation edge cases > should require valid department` | Throws for empty department |

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/services/employee.test.ts
```

---

## File 2: `tests/unit/services/analytics.test.ts`

**Classification:** SKIP — pre-existing syntax errors (escaped-backtick), not a must-pass target

Do not attempt to fix. Do not include in pass/fail requirements for this implementation plan.

---

## File 3: `tests/unit/services/hiring.test.ts`

**Classification:** SKIP — pre-existing syntax errors (escaped-backtick), not a must-pass target

Do not attempt to fix. Do not include in pass/fail requirements for this implementation plan.

---

## File 4: `tests/unit/auth/auth-session.test.ts`

**Classification:** NEW — must go green (Task 1)

Tests the JWT and session callback logic in isolation, without involving NextAuth internals. Verifies that `companyId`, `role`, and `employeeId` are correctly threaded from the authorize result through JWT into the session object.

| Test name | Asserts |
|-----------|---------|
| `Auth callbacks > jwt callback preserves companyId from user object` | After jwt callback with user, token.companyId is "company-1", token.role is "EMPLOYEE", token.employeeId is "emp-1" |
| `Auth callbacks > jwt callback with no user leaves token unchanged` | Without a user argument, existing token fields including companyId are preserved |
| `Auth callbacks > session callback copies companyId from token to session.user` | session.user.companyId is "company-1", session.user.id is "user-1", session.user.role is "EMPLOYEE" |
| `Auth callbacks > session callback sets empty string when sub is missing` | When token has no sub, session.user.id is "" |

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/auth/auth-session.test.ts
```

---

## File 5: `tests/unit/providers/trpc-provider.test.tsx`

**Classification:** NEW — must go green (Task 2)

Tests that the `Providers` component mounts children without throwing a tRPC context error. Confirms the `trpc.Provider` and `QueryClientProvider` are present in the component tree.

| Test name | Asserts |
|-----------|---------|
| `Providers > renders children without throwing tRPC context error` | Wrapping a child in `<Providers>` does not throw; the child element is in the document |

**Mocks required:**
- `next-auth/react` — `SessionProvider` renders children passthrough, `useSession` returns unauthenticated

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/providers/trpc-provider.test.tsx
```

---

## File 6: `tests/unit/routers/employee.router.test.ts`

**Classification:** NEW — must go green (Task 3)

Integration tests that call `employeeRouter` procedures directly against a real seeded SQLite test database. Uses `prisma db push` in `beforeAll` to apply the schema to a temp file at `/tmp/test-people-{pid}.db`. Tears down the file in `afterAll`.

Requires all six router bugs to be fixed in `src/server/routers/employee.ts` before these tests can pass:
1. Remove `mode: 'insensitive'` from list search filters
2. Fix department filter to use relation (`where.department = { name: department }`)
3. Add `department` include to list
4. Remove non-existent `jobTitle` from `directReports` select in `getById`
5. Add `department` and `site` includes to `getById`
6. Remove non-existent `department` and `jobTitle` fields from `create` mutation data

| Test name | Asserts |
|-----------|---------|
| `employeeRouter.list > returns only employees from the caller company` | Result has exactly 2 employees, all with matching companyId |
| `employeeRouter.list > returns correct fields including manager relation` | Alice is present; `manager` key exists on the returned employee object |
| `employeeRouter.list > filters by search string (partial first name match)` | search "ali" returns 1 employee named Alice |
| `employeeRouter.list > search is case-insensitive for ASCII (SQLite LIKE default behavior)` | search "ALI" returns 1 employee (SQLite LIKE behavior) |
| `employeeRouter.list > search by email works` | search "bob@test" returns 1 employee named Bob |
| `employeeRouter.list > returns empty results for search with no match` | search "zzznomatch" returns 0 employees and undefined nextCursor |
| `employeeRouter.list > paginates correctly with limit` | limit 1 returns 1 employee with nextCursor; using that cursor returns a different employee |
| `employeeRouter.list > returns all when limit is large enough` | limit 100 returns 2 employees, nextCursor is undefined |
| `employeeRouter.getById > returns the employee with relations when found` | Correct id, firstName, companyId; directReports is an array |
| `employeeRouter.getById > throws NOT_FOUND for non-existent employee` | Calling with a fake id throws "Employee not found" |
| `employeeRouter.getById > throws FORBIDDEN when employee belongs to different company` | Calling with an employee from another company throws "You do not have access to this employee" |

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/routers/employee.router.test.ts
```

---

## File 7: `tests/unit/components/people-page.test.tsx`

**Classification:** NEW — must go green (Task 4)

Component tests for the People directory page. The tRPC `employee.list.useQuery` hook is mocked to return a fixed list of 3 employees. Tests verify the component renders live data, not hardcoded names, and that the search input and employee count display work correctly.

| Test name | Asserts |
|-----------|---------|
| `People directory page > renders employee names from tRPC data` | "Alice Smith", "Bob Jones", "Carol On Leave" are all in the document |
| `People directory page > does not show hardcoded names` | "Sarah Chen" and "Mike Johnson" are NOT in the document |
| `People directory page > shows ACTIVE status badge for active employees` | At least 2 "Active" badge elements are present |
| `People directory page > shows department names` | "Engineering" appears at least once |
| `People directory page > employee card links to /people/[id]` | The Alice Smith link has `href="/people/emp-1"` |
| `People directory page > shows loading state while query is loading` | When isLoading is true, text matching /loading/i is in the document |
| `People directory page > search input calls tRPC with search param after debounce` | After typing "Ali" into the search input, the input's value is "Ali" |
| `People directory page > shows employee count` | Text matching /3.*employees/i is present |

**Mocks required:**
- `@/lib/trpc` — `trpc.employee.list.useQuery` returns fixture employees; `trpc.employee.create.useMutation` returns stub; `trpc.useContext` returns invalidate stub
- `@/components/people/add-employee-modal` — renders a dialog or null based on `open` prop (avoids MODULE_NOT_FOUND before Task 5 creates the file)
- `next-auth/react` — `useSession` returns authenticated session with companyId
- `next/navigation` — `useRouter`, `usePathname` stubbed
- `next/link` — renders as plain `<a>` element

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/people-page.test.tsx
```

---

## File 8: `tests/unit/components/add-employee-modal.test.tsx`

**Classification:** NEW — must go green (Task 5)

Component tests for the `AddEmployeeModal`. Verifies the modal only renders when `open=true`, that form fields are present, that required-field validation prevents submission on empty form, that a valid form calls the create mutation with correct data, and that the modal closes on success.

| Test name | Asserts |
|-----------|---------|
| `AddEmployeeModal > does not render when open=false` | No dialog element is in the document |
| `AddEmployeeModal > renders form fields when open=true` | First Name, Last Name, Email labeled inputs are present |
| `AddEmployeeModal > submit button is visible` | Button with text "Add Employee" is in the document |
| `AddEmployeeModal > shows validation error for empty required fields on submit` | Clicking submit with empty form does not invoke `mutateAsync` |
| `AddEmployeeModal > calls create mutation with form data on valid submit` | After filling firstName "Jane", lastName "Doe", email "jane@test.corp" and submitting, `mutateAsync` is called with `{ firstName: "Jane", lastName: "Doe", email: "jane@test.corp", companyId: "co-1" }` |
| `AddEmployeeModal > closes modal after successful submission` | After successful mutation, `onOpenChange` is called with `false` |

**Mocks required:**
- `@/lib/trpc` — `trpc.employee.create.useMutation` returns `{ mutateAsync: vi.fn().mockResolvedValue({ id: 'new-emp-1' }), isLoading: false, error: null }`; `trpc.useContext` returns invalidate stub
- `next-auth/react` — `useSession` returns authenticated session with companyId "co-1"

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/add-employee-modal.test.tsx
```

---

## File 9: `tests/unit/components/employee-profile.test.tsx`

**Classification:** NEW — must go green (Task 6)

Component tests for the Employee Profile page. The tRPC `employee.getById.useQuery` hook is mocked. Tests verify the component renders live data from the mock (not the hardcoded "Sarah Chen"), shows the correct status badge and department, shows the manager name in the Employment tab, and handles loading and error states.

| Test name | Asserts |
|-----------|---------|
| `Employee profile page > renders employee full name` | "Alice Smith" is in the document |
| `Employee profile page > shows ACTIVE status badge` | "Active" badge text is in the document |
| `Employee profile page > shows employee email` | "alice@test.corp" is in the document |
| `Employee profile page > shows manager name in Employment tab` | "Bob Manager" is in the document (including hidden Radix UI tab content) |
| `Employee profile page > shows department name` | "Engineering" is in the document |
| `Employee profile page > shows loading state` | When isLoading is true, text matching /loading/i is present |
| `Employee profile page > shows not found when error` | When error is set, text matching /not found/i is present |
| `Employee profile page > does not show hardcoded Sarah Chen` | "Sarah Chen" is NOT in the document |

**Mocks required:**
- `@/lib/trpc` — `trpc.employee.getById.useQuery` returns configurable mock value per test
- `next/navigation` — `useParams` returns `{ id: 'emp-test-1' }`; `useRouter` returns `{ back: vi.fn() }`

**Run command:**
```bash
cd /workspace/.worktrees/wire-people-module && npx vitest run tests/unit/components/employee-profile.test.tsx
```

---

## Full Must-Pass Test Matrix

| File | Classification | Task | Expected result |
|------|---------------|------|----------------|
| `tests/unit/services/employee.test.ts` | REGRESSION | All tasks | Green throughout |
| `tests/unit/services/analytics.test.ts` | SKIP | — | Known broken baseline, do not include |
| `tests/unit/services/hiring.test.ts` | SKIP | — | Known broken baseline, do not include |
| `tests/unit/auth/auth-session.test.ts` | NEW | Task 1 | Green after Task 1 |
| `tests/unit/providers/trpc-provider.test.tsx` | NEW | Task 2 | Green after Task 2 |
| `tests/unit/routers/employee.router.test.ts` | NEW | Task 3 | Green after Task 3 (requires all 6 router bugs fixed first) |
| `tests/unit/components/people-page.test.tsx` | NEW | Task 4 | Green after Task 4 |
| `tests/unit/components/add-employee-modal.test.tsx` | NEW | Task 5 | Green after Task 5 |
| `tests/unit/components/employee-profile.test.tsx` | NEW | Task 6 | Green after Task 6 |

---

## Ordering Constraints

1. Router bugs in `src/server/routers/employee.ts` (Task 3, Step 1) must be applied **before** writing `employee.router.test.ts` — the integration tests hit real Prisma queries that crash on the unfixed bugs.
2. `add-employee-modal.test.tsx` (Task 5) depends on the `AddEmployeeModal` component being created in the same task — cannot green before Task 5 Step 3.
3. `people-page.test.tsx` (Task 4) mocks `@/components/people/add-employee-modal` because the file does not exist until Task 5. The mock must be in the test file so Task 4 can be completed independently before Task 5.
4. The regression test (`employee.test.ts`) must be run after every task commit to confirm no breakage.
