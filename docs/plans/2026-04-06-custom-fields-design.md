# Custom Fields & Table Flexibility Design (HiBob Clone)

## Overview
A powerful, meta-data-driven engine that allows admins to create arbitrary data tables (e.g., "IT Equipment", "Emergency Contacts") with custom columns and row-level permissions, all without changing the database schema.

## Architecture & Schema
- **New Model: `CustomTableDefinition`**:
  - `id`: CUID
  - `companyId`: String
  - `name`: String
  - `columns`: JSON (e.g., `[{name: "Model", type: "STRING"}, {name: "Issued", type: "DATE"}]`)
  - `permissions`: JSON (e.g., `{employeeView: true, managerEdit: false}`)
- **New Model: `CustomTableRow`**:
  - `id`: CUID
  - `employeeId`: String (Relation to Employee)
  - `tableId`: String (Relation to CustomTableDefinition)
  - `data`: JSON (Stores actual row values as key-value pairs)

## UI Components
- **`DynamicDataSection` (Profile Tab)**:
  - Fetches all definitions for the company and renders them as clickable sub-tabs or accordion sections.
- **`DynamicTable`**:
  - A responsive table component that maps the JSON `data` from `CustomTableRow` into columns defined in `CustomTableDefinition`.
- **`DynamicEntryModal`**:
  - An auto-generated form that renders appropriate inputs (Text, Date, Select) based on the column types defined in the schema.

## Data Flow
1. **Schema Fetch**: UI calls `custom.getDefinitions` to understand what tables exist.
2. **Row Fetch**: UI calls `custom.getRows(tableId, employeeId)` to fetch data.
3. **Upsert**: `custom.upsertRow` validates JSON payload against the table's column schema before saving.
4. **Permissions**: The router filters results based on the `permissions` JSON and the user's current role.

## Testing & Validation
- **Engine Tests**: Verify the JSON validator correctly identifies type mismatches (e.g., string in a date column).
- **Security Tests**: Ensure users cannot fetch rows for tables marked `employeeView: false`.
- **UI Tests**: Verify the `DynamicEntryModal` correctly generates form fields for complex table definitions.
