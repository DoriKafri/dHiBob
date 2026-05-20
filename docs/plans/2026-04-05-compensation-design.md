# Compensation Engine (Event-Sourced) Design

## Overview
A robust Compensation Management module handling salary bands, compa-ratio analysis, merit cycles, and total rewards statements, built on an event-sourced ledger architecture.

## Architecture & Data Models
- **`CompensationEvent` Prisma Model**: An immutable ledger of pay changes with `employeeId`, `type` (BASE_SALARY, BONUS, EQUITY_GRANT), `amount`, `currency`, `effectiveDate`, `reason`, `status` (PENDING, APPROVED, REJECTED), and `approvedById`.
- **`SalaryBand` Prisma Model**: Defines pay ranges for roles with `companyId`, `jobTitle`, `department`, `min`, `mid`, `max`, and `currency`.
- **Core Engine Functions**:
  - `getCurrentCompensation(employeeId, asOfDate)`: Derives the current salary from the latest `BASE_SALARY` event.
  - `calculateCompaRatio(employeeId)`: Compares derived salary to `SalaryBand.mid`.
- **Dashboard UI (`/compensation`)**: Real tRPC queries aggregating data, featuring an interactive `SalaryBandsChart` built with Recharts.

## Workflows
- **Merit Cycles**: Managers propose raises, creating `PENDING` events. HR reviews a batch table (`/compensation/reviews`) and transitions them to `APPROVED`.
- **Equity Grants**: Store `amount` (shares) and `vestingSchedule` (JSON). Vesting is calculated on the fly for MVP based on the `effectiveDate`.
- **Total Rewards Statements**: A new employee profile tab (`/people/[id]/compensation`) showing a pie chart of Base Salary + Bonuses (last 12m) + Estimated Vested Equity.
- **Currency**: MVP standardizes on USD for calculations but stores currency codes on all records for future multi-currency support.

## Testing Strategy
- **Unit Tests (Engine Logic)**: Focus on `getCurrentSalary` and `calculateCompaRatio` handling complex scenarios like back-dated changes and future merit cycles using mock event arrays.
- **Integration Tests (tRPC)**: Ensure strict multi-tenant scoping (`companyId: ctx.user.companyId`) and role-based access control (Managers see reports, HR sees all, Employees see themselves).
- **Component Tests**: Verify the `SalaryBandsChart` correctly positions employees relative to bands and test the Merit Cycle approval table's optimistic UI updates.
