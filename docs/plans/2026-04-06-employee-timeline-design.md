# Employee Timeline & Lifecycle Design (HiBob Clone)

## Overview
A visual, vertical chronological representation of an employee's career journey within the company. It tracks major milestones like hiring, promotions, department changes, and salary updates.

## Architecture & Schema
- **New Model: `JobRecord`**:
  - `id`: CUID
  - `employeeId`: String (Relation to Employee)
  - `type`: Enum (HIRED, PROMOTION, DEPT_CHANGE, MANAGER_CHANGE, NOTE)
  - `effectiveDate`: DateTime
  - `title`: String
  - `description`: String?
  - `metadata`: JSON (Stores 'from' and 'to' values)
- **Aggregator Query (`employee.getTimeline`)**:
  - Fetches both `JobRecord` and `CompensationRecord`.
  - Normalizes into a unified `TimelineEvent` type.
  - **Security Filter**: Salary-related events are only returned for the user themselves, their manager, or HR/Admins.

## UI Components
- **`LifecycleTimeline` (Tab Content)**: 
  - A vertical timeline layout with a central connecting line.
- **`TimelineCard`**: 
  - Renders specific event details.
  - Icons: Rocket (Promotion), Building (Dept), Dollar (Salary), User (Manager), Sparkles (Hire).
- **Profile Edit Integration**: 
  - The profile edit form includes a "Create milestone" checkbox to trigger automatic `JobRecord` creation.

## Data Flow
1. **Trigger**: Admin saves a profile update with "Create milestone" checked.
2. **Persistence**: The backend compares old vs. new data and creates a `JobRecord`.
3. **Consumption**: When the "Timeline" tab is opened, `getTimeline` fetches the merged history.
4. **Display**: Events are rendered in descending chronological order.

## Testing & Validation
- **Unit Tests**: Verify the timeline merger logic handles empty states and single-event histories.
- **Permission Tests**: Confirm sensitive compensation events are hidden from unauthorized users.
- **UI Tests**: Ensure the vertical line is responsive across different screen sizes.
