# Test Plan: Add Polish Zloty (PLN) Currency

## Strategy reconciliation

The implementation plan describes a small, mechanical change adding PLN to ~7 files: a currency utility, the employee profile page badge/dropdown constants, the expenses page currency selector, and the IT licenses page currency selector. No schema changes, no new components, no new routers.

The agreed testing strategy is lightweight — the plan itself states "no new tests" and relies on `npx vitest run` regression plus manual checks. After reconciling against the plan, the strategy holds with one minor strengthening: the `src/lib/currency.ts` file is a pure utility with `currencySymbol`, `formatCurrency`, and `convertCurrency` functions. These are trivially testable in isolation and the codebase currently has **zero unit tests for this file**. Adding a small set of unit tests for the currency utility is warranted because:

1. The utility is used across reports, payroll, compensation, and profile pages — a bug in `currencySymbol('PLN')` returning the wrong symbol would silently corrupt every PLN-formatted amount in the system.
2. The `convertCurrency` function uses the `FALLBACK_RATES_TO_USD` map — if the PLN rate is wrong or missing, cross-currency conversions involving PLN would be silently incorrect.
3. These are pure functions with no dependencies — the tests are trivial to write and run in milliseconds.

The component-level tests (checking that PLN appears in dropdown options, badge colors render, etc.) are **not** included because the relevant UI components use opaque constants (`CURRENCY_OPTIONS`, `BADGE_COLORS`) that are not exported and are only exercised through full React rendering with tRPC mocks. The cost of setting up those mocks for a one-element array addition is disproportionate to the risk. The existing component tests for these pages will catch any breakage from the changes.

## Test plan

### T-1: `currencySymbol` returns the PLN symbol

- **Name**: PLN currency code resolves to zloty symbol
- **Type**: unit
- **Disposition**: new
- **Harness**: Vitest direct import
- **Preconditions**: None (pure function)
- **Actions**: Call `currencySymbol('PLN')`
- **Expected outcome**: Returns `'zł'` (source of truth: implementation plan Task 1, which specifies `PLN: 'zł'` in the SYMBOLS map)
- **Interactions**: None

### T-2: `currencySymbol` is case-insensitive for PLN

- **Name**: PLN symbol lookup works regardless of input case
- **Type**: boundary
- **Disposition**: new
- **Harness**: Vitest direct import
- **Preconditions**: None
- **Actions**: Call `currencySymbol('pln')` and `currencySymbol('Pln')`
- **Expected outcome**: Both return `'zł'` — the function calls `code.toUpperCase()` internally (source of truth: existing `currencySymbol` implementation which normalizes to uppercase)
- **Interactions**: None

### T-3: `formatCurrency` formats a PLN amount correctly

- **Name**: Formatting an amount with PLN prepends the zloty symbol
- **Type**: unit
- **Disposition**: new
- **Harness**: Vitest direct import
- **Preconditions**: None
- **Actions**: Call `formatCurrency(150000, 'PLN')`
- **Expected outcome**: Returns `'zł150,000'` (source of truth: `formatCurrency` concatenates `currencySymbol(code)` with `amount.toLocaleString()`)
- **Interactions**: None

### T-4: `convertCurrency` uses PLN fallback rate

- **Name**: Currency conversion from PLN to USD uses the correct fallback rate
- **Type**: unit
- **Disposition**: new
- **Harness**: Vitest direct import
- **Preconditions**: None (no live rates passed — exercises the fallback path)
- **Actions**: Call `convertCurrency(1000, 'PLN', 'USD')` with no rates argument
- **Expected outcome**: Returns `Math.round((1000 * 0.24) / 1)` = `240` (source of truth: implementation plan Task 1 specifies `PLN: 0.24` in `FALLBACK_RATES_TO_USD`)
- **Interactions**: None

### T-5: `convertCurrency` PLN-to-PLN is identity

- **Name**: Converting PLN to PLN returns the same amount
- **Type**: invariant
- **Disposition**: new
- **Harness**: Vitest direct import
- **Preconditions**: None
- **Actions**: Call `convertCurrency(5000, 'PLN', 'PLN')`
- **Expected outcome**: Returns `5000` (source of truth: `convertCurrency` short-circuits when `from === to`)
- **Interactions**: None

### T-6: All 10 original currencies still have correct symbols

- **Name**: Adding PLN does not corrupt existing currency symbols
- **Type**: regression
- **Disposition**: new
- **Harness**: Vitest direct import
- **Preconditions**: None
- **Actions**: Call `currencySymbol(code)` for each of USD, EUR, GBP, ILS, CAD, AUD, CHF, JPY, INR, BRL
- **Expected outcome**: Each returns its established symbol ($, €, £, ₪, C$, A$, CHF, ¥, ₹, R$) — no values changed by the PLN addition
- **Interactions**: None

### T-7: Existing test suite passes (regression gate)

- **Name**: All existing automated tests remain green after PLN addition
- **Type**: regression
- **Disposition**: existing
- **Harness**: `npx vitest run`
- **Preconditions**: None
- **Actions**: Run `npx vitest run` from the worktree root
- **Expected outcome**: All currently-passing tests continue to pass (1 pre-existing live-DB failure in `employee.router.test.ts` is expected and unrelated)
- **Interactions**: All existing test harnesses

### T-8: TypeScript compiles without errors

- **Name**: No type errors introduced by PLN additions
- **Type**: invariant
- **Disposition**: existing
- **Harness**: `npx tsc --noEmit`
- **Preconditions**: None
- **Actions**: Run `npx tsc --noEmit` from the worktree root
- **Expected outcome**: Exit code 0, zero errors
- **Interactions**: All TypeScript source files

## Coverage summary

**Covered:**
- PLN symbol resolution (`currencySymbol`)
- PLN amount formatting (`formatCurrency`)
- PLN currency conversion with fallback rate (`convertCurrency`)
- Case-insensitivity of PLN lookup
- Identity conversion (PLN-to-PLN)
- Regression: all 10 existing currency symbols unchanged
- Regression: full existing test suite
- Type safety: `tsc --noEmit`

**Explicitly excluded (per strategy):**
- Component-level tests for PLN appearing in `CURRENCY_OPTIONS` dropdowns (expenses, IT licenses, profile page). The risk is low: the change is adding a string literal to an array. The existing component tests for these pages provide adequate regression coverage. The cost of adding mocked-tRPC component tests for this would outweigh the quality signal.
- Badge color rendering for PLN in the profile page. `badgeColor()` falls back to a neutral gray for unknown keys, and PLN uses `pln` which maps to a specific orange badge class. Testing this requires rendering the full profile component with tRPC mocks — disproportionate for a CSS class mapping.
- Manual verification of the PLN option in the UI (Docker rebuild + browser). This is left to the user's manual QA pass after implementation.

**Residual risk:**
- If PLN is accidentally omitted from the `CURRENCY_OPTIONS` array or the expenses/IT-licenses `<select>` options, the PLN entry won't appear in those dropdowns. This is a low-probability error (the implementation plan is explicit about which lines to change) and would be caught by the first manual test.
