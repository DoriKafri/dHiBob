# Golden Path Polish Design (HiBob Clone)

## Overview
A comprehensive polish pass to ensure the "Golden Paths" of our core modules are 100% functional, secure, and user-friendly. This covers Social Posting, Time Off transparency, Custom Table management, and Timeline accuracy.

## 1. Home Feed: Real Targeted Shoutouts
- **tRPC Mutation (`home.createShoutout`)**:
  - Validates `targetId` belongs to the same company.
  - Automatically sets `authorId` to the current session user.
- **`ShoutoutModal`**:
  - Features an autocomplete colleague picker (Team-first scoping).
  - Dynamic textarea with character counting and pre-filled themes (Rocket, Claps).
  - Optimistic UI refresh on the activity feed.

## 2. Time Off: Balance Awareness
- **Request Form Update**:
  - The `RequestFormModal` now displays "Available Balance" prominently after picking a policy.
  - Integration with the `AccrualEngine` to perform a future-date check *within the modal*.
  - Disables the "Submit" button if the request exceeds the projected balance.

## 3. Custom Tables: Lifecycle Management
- **Row Deletion**:
  - Adds a "Trash" icon to rows in the `DynamicTable`.
  - New tRPC mutation `custom.deleteRow` with multi-tenant ownership check.
- **Row Editing**:
  - Clicking "Edit" on a row re-opens the `DynamicEntryModal` pre-populated with existing JSON data.

## 4. Timeline: Automatic Detection Precision
- **Update Logic**:
  - The `update` mutation in the `employee` router is refined to perform a deep equality check on sensitive fields (`jobTitle`, `departmentId`, `managerId`).
  - Only creates milestones for the *specific* fields that changed, preventing redundant or incorrect history entries.

## Testing & Validation
- **End-to-End**: A full flow check: Create a Custom Table ➜ Add Row ➜ Edit Row ➜ Delete Row.
- **Security**: Verify regular employees cannot delete another user's custom table entries.
- **Aesthetics**: Final pass on HiBob "Lush" green and "Cherry" red accents across all new modals.
