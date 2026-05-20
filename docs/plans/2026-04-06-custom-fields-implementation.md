# Custom Fields & Table Flexibility Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a metadata-driven engine for arbitrary data tables with custom columns and row-level permissions.

**Architecture:** We will add `CustomTableDefinition` and `CustomTableRow` models to the schema, implement a tRPC router for schema and data management, and build a dynamic UI that generates forms and tables based on the metadata.

**Tech Stack:** Next.js, tRPC, Prisma, Tailwind CSS, React Hook Form, Lucide React.

---

### Task 1: Update Schema & Database

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add Custom Models**

```prisma
model CustomTableDefinition {
  id          String   @id @default(cuid())
  companyId   String
  name        String
  description String?
  columns     String   @default("[]") // JSON: [{name: string, type: 'STRING'|'NUMBER'|'DATE'|'SELECT', options?: string[]}]
  permissions String   @default("{}") // JSON: {employeeView: boolean, managerEdit: boolean}
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  rows        CustomTableRow[]
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@index([companyId])
}

model CustomTableRow {
  id                String   @id @default(cuid())
  employeeId        String
  tableDefinitionId String
  data              String   @default("{}") // JSON: {columnName: value}
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  employee          Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  definition        CustomTableDefinition @relation(fields: [tableDefinitionId], references: [id], onDelete: Cascade)
  @@index([employeeId])
  @@index([tableDefinitionId])
}
```

**Step 2: Generate Client**
Run: `npx prisma generate`

**Step 3: Commit**

---

### Task 2: Implement Custom Fields tRPC Router

**Files:**
- Create: `src/server/routers/custom.ts`
- Modify: `src/server/routers/_app.ts`
- Test: `tests/unit/routers/custom.router.test.ts` (Create)

**Step 1: Implement `getDefinitions` and `getRows` queries**
- Ensure strict multi-tenant scoping and permission checking.

**Step 2: Implement `upsertRow` mutation**
- Logic: Validate incoming JSON against the definition's columns.

**Step 3: Register in `_app.ts`**

**Step 4: Commit**

---

### Task 3: Build Dynamic Data UI

**Files:**
- Create: `src/components/people/dynamic-data-section.tsx`
- Create: `src/components/people/dynamic-table.tsx`
- Create: `src/components/people/dynamic-entry-modal.tsx`
- Modify: `src/app/(dashboard)/people/[id]/page.tsx`

**Step 1: Build `DynamicEntryModal`**
- Logic: Loop through columns and render `Input` or `Select`.

**Step 2: Build `DynamicTable`**
- Logic: Map JSON data to columns.

**Step 3: Integrate into "Additional Data" tab** (Rename "Documents" or add new tab).

**Step 4: Commit**

---

### Task 4: Admin Management UI

**Files:**
- Create: `src/app/(dashboard)/settings/custom-tables/page.tsx`

**Step 1: Build a page to create/edit `CustomTableDefinition`**
- For MVP: A simple JSON editor or basic form to define columns.

**Step 2: Commit**

---

### Task 5: Final Validation & Polish

**Step 1: Run full test suite**
**Step 2: Visual styling check**
**Step 3: Commit**
