# Add Polish Zloty (PLN) Currency

## Summary

Add PLN (Polish Zloty) to every place in the system where currencies appear: dropdown selectors, badge color mapping, currency symbol/formatting, exchange rate fallback, and all hardcoded currency arrays across pages.

## Scope

This is a small, mechanical change touching ~7 files. No schema changes, no new tests, no new components — just adding PLN to existing arrays/maps.

## Changes

### Task 1 — Currency utility (`src/lib/currency.ts`)

1. Add `PLN: 'zł'` to the `SYMBOLS` map (line ~16)
2. Add `PLN: 0.24` to the `FALLBACK_RATES_TO_USD` map (line ~44, approximate rate: 1 PLN ≈ $0.24)

### Task 2 — Employee profile page (`src/app/(dashboard)/people/[id]/page.tsx`)

1. Add PLN badge color to `BADGE_COLORS` (after `brl` around line 204):
   ```
   pln: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
   ```
   (Orange chosen because red is already used by CAD — orange is unused by any currency badge)

2. Add `'PLN'` to the `CURRENCY_OPTIONS` array (line 212)

3. Add `'PLN'` to the inline asset currency dropdown arrays (lines ~1409, ~1443)

### Task 3 — Expenses page (`src/app/(dashboard)/expenses/page.tsx`)

1. Add `'PLN'` to the currency `<select>` options array (line ~329)

### Task 4 — IT Licenses page (`src/app/(dashboard)/it-licenses/page.tsx`)

1. Add `'PLN'` to the currency `<select>` options array (line ~255)

### Task 5 — Verify (no code change needed)

- Reports page (`src/app/(dashboard)/reports/page.tsx`): reads currency from data, uses `formatCurrency()` — inherits PLN support from Task 1 automatically.
- Exchange rate fetcher (`getExchangeRates`): queries frankfurter.app which returns PLN natively — no code change needed.
- Router Zod schemas: all use `z.string()` for currency fields — no validation change needed.
- Seed data: no employees currently use PLN — optionally, the user can assign PLN to employees manually through the UI.

## Verification

1. `npx vitest run` — all existing tests pass (PLN is additive, no behavior change)
2. Manual: open an employee profile → Compensation History → Salary Currency dropdown → PLN appears with a red badge
3. Manual: Expenses page → currency dropdown → PLN appears
4. Manual: IT Licenses → add/edit license → currency dropdown → PLN appears
5. `npx tsc --noEmit` — zero errors
