# Advanced Time Off Polishing Design (HiBob Clone)

## Overview
A high-fidelity HRIS-grade Time Off system that moves from simple fixed grants to dynamic pro-rated accruals and an interactive team-wide horizontal calendar.

## Architecture & Accrual Engine
- **Accrual Logic (`lib/accrual-engine.ts`)**:
  - **Available Balance**: `(Months Elapsed * Accrual Rate) + Carryover - Approved Days Taken`.
  - **Hire Date Sensitivity**: Accruals start from `startDate` for new hires.
  - **Capped Carryover**: On Jan 1st, unused days are rolled over but capped by the policy's `maxCarryOver` value.
- **tRPC `timeoff.getPolicyBalances`**:
  - Returns a calculated balance object for every active policy: `accrued`, `used`, `pending`, `availableNow`, and `projectedYearEnd`.

## UI Components
- **Horizontal Team Timeline (`components/time-off/team-calendar.tsx`)**:
    - **X-Axis**: Days of the month.
    - **Y-Axis**: Employees in the same team/department.
    - **Visual States**:
        - `Solid Block`: Approved leave (Policy-specific color).
        - `Striped/Muted`: Pending requests.
        - `Collision Indicator`: Highlights days where >30% of the team is out.
- **Policy Balance Cards**: Replaces the static list with high-fidelity cards showing progress bars (HiBob "Lush" green) and detailed tooltips for accrual breakdowns.

## Data Flow
1. **Balance Fetching**: The `TimeOffPage` calls `getPolicyBalances` to populate the summary cards.
2. **Calendar Fetching**: `listRequests` is called with a date range (start/end of month) to populate the horizontal timeline.
3. **Request Validation**: The `submitRequest` mutation now performs a *future-date* check, ensuring the user will have enough *accrued* days by the time their leave starts.

## Testing & Validation
- **Unit Tests (`accrual-engine.test.ts`)**: Focus on edge cases like mid-year hires (pro-rated first month) and carryover limits.
- **Integration Tests**: Verify the `submitRequest` mutation correctly rejects requests that exceed the *projected* balance.
- **UI Tests**: Ensure the Horizontal Calendar correctly spans multiple days for a single request.
