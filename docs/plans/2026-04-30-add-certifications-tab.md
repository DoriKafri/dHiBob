# Add Certifications Tab to Employee Profile

## Overview
Add a new "Certifications" tab to the employee profile page (`/people/[id]`) that lets admins and the employee themselves track professional certifications. Each certification stores a name, issuing authority, issue date, expiry date, and a document URL/link. The implementation follows the existing pattern used by salary history and assets: data lives inside the `workInfo` JSON blob on the Employee model, with no schema migration required.

## Data Model

### Storage: `workInfo.certifications` (JSON array inside `Employee.workInfo`)

Each entry in the array has the following shape:

```ts
interface Certification {
  name: string;           // e.g. "AWS Solutions Architect"
  issuingAuthority: string; // e.g. "Amazon Web Services"
  issueDate: string;      // ISO date string, e.g. "2025-06-15"
  expiryDate: string;     // ISO date string, optional — empty string if none
  documentUrl: string;    // External URL or uploaded file JSON (same format as contractDoc)
}
```

This mirrors the pattern of `workInfo.salaryHistory` (array of objects) and `workInfo.assets` (array of objects). No Prisma schema change or database migration is needed.

## Backend Changes

### File: `src/server/routers/employee.ts`

1. **Add `certifications` to the `updateWorkInfo` input schema** — add `certifications: z.any().optional()` alongside the existing `assets: z.any().optional()` and `salaryHistory: z.any().optional()`. The mutation handler already merges incoming fields into the existing `workInfo` JSON via spread, so no logic changes are needed in the mutation body.

That is the only backend change. The existing `updateWorkInfo` mutation's merge logic (`{ ...currentWorkInfo, ...fields }`) handles persisting the certifications array automatically.

## Frontend Changes

### File: `src/app/(dashboard)/people/[id]/page.tsx`

#### 1. Add a new tab trigger

Insert a `<TabsTrigger value="certifications">` into the `<TabsList>` alongside the existing tabs. Visibility rule: show the tab when `canSeeSensitive || isSelf` — the same gate used for "IT Equipment & Licenses". Both admins and the employee themselves should see and manage their certifications.

```
Position in tab bar (after Assets, before IT Equipment & Licenses):
  Profile | Work | Assets | Certifications | IT Equipment & Licenses | Bank Details | Pension
```

#### 2. Parse certifications from workInfo

At the top of the component where `assets` and `salaryHistory` are parsed from `workInfo`, add:

```ts
const certifications: Array<{
  name?: string;
  issuingAuthority?: string;
  issueDate?: string;
  expiryDate?: string;
  documentUrl?: string;
}> = Array.isArray(workInfo.certifications) ? workInfo.certifications : [];
```

#### 3. Add per-row save/add/delete helpers

Follow the exact pattern of `saveSalaryField`, `addSalaryEntry`, and `deleteSalaryEntry`:

```ts
const saveCertField = (idx: number, field: string) => (isAdmin || isSelf)
  ? (val: string) => {
      const base = certifications.length > 0 ? certifications : [{}];
      const updated = base.map((e, i) => i === idx ? { ...e, [field]: val } : e);
      return updateWorkInfo.mutateAsync({ id: params.id, certifications: updated } as any);
    }
  : undefined;

const addCertEntry = () => {
  const updated = [...certifications, { name: '', issuingAuthority: '', issueDate: '', expiryDate: '', documentUrl: '' }];
  updateWorkInfo.mutateAsync({ id: params.id, certifications: updated } as any);
};

const deleteCertEntry = (idx: number) => {
  const updated = certifications.filter((_, i) => i !== idx);
  updateWorkInfo.mutateAsync({ id: params.id, certifications: updated } as any);
};
```

Key difference from salary history: `saveCertField` grants edit permission when `isAdmin || isSelf`, not just `isAdmin`. This lets employees manage their own certifications.

#### 4. Add the `<TabsContent value="certifications">` section

Render a `<SectionCard title="Certifications">` containing a table with the following columns:

| Column             | Component              | Notes                                            |
|--------------------|------------------------|--------------------------------------------------|
| Name               | `F` (EditableField)    | Required — certification name                    |
| Issuing Authority  | `F` (EditableField)    | e.g. "AWS", "PMI", "Cisco"                       |
| Issue Date         | `DateField`            | When the certification was obtained               |
| Expiry Date        | `DateField`            | Optional — leave blank for non-expiring certs     |
| Document           | `DocumentField`        | Upload a scan/PDF, or leave blank for URL-only    |
| Delete             | `Trash2` icon button   | Only shown to admin or self                       |

Below the table, show an "Add certification" button (visible to admin or self) using the `<Plus>` icon, matching the existing "Add salary entry" and "Add asset" buttons.

#### 5. Expiry visual indicator

When an expiry date exists and is in the past, show a small red "Expired" badge next to the date. When the expiry date is within 90 days, show an amber "Expiring soon" badge. This uses a simple date comparison — no new dependencies.

## Permission Model

| Action             | Admin/HR | Employee (self) | Other employees |
|--------------------|----------|-----------------|-----------------|
| View tab           | Yes      | Yes             | No              |
| Add certification  | Yes      | Yes             | No              |
| Edit certification | Yes      | Yes             | No              |
| Delete certification| Yes     | Yes             | No              |

This matches the permission model of the "IT Equipment & Licenses" tab (`canSeeSensitive || isSelf`) for visibility and allows self-service editing (unlike salary history which is admin-only).

## Implementation Steps

1. **Backend** — Add `certifications: z.any().optional()` to the `updateWorkInfo` zod schema in `src/server/routers/employee.ts`. (1 line)
2. **Frontend — tab trigger** — Add the `<TabsTrigger>` for "Certifications" in the tab bar, gated on `canSeeSensitive || isSelf`.
3. **Frontend — data parsing** — Parse `workInfo.certifications` into a typed array.
4. **Frontend — helpers** — Add `saveCertField`, `addCertEntry`, `deleteCertEntry` functions.
5. **Frontend — tab content** — Build the `<TabsContent>` with the certifications table using existing `SectionCard`, `F`, `DateField`, `DocumentField`, and `Trash2` components.
6. **Frontend — expiry badges** — Add conditional expiry status badges (red/amber).

## Files Modified

- `src/server/routers/employee.ts` — 1 line added to zod schema
- `src/app/(dashboard)/people/[id]/page.tsx` — new tab trigger, data parsing, helpers, and tab content section

## Testing Plan

- Verify the tab appears for admins viewing any employee and for employees viewing their own profile.
- Verify the tab does not appear for non-admin employees viewing another employee's profile.
- Add a certification with all fields populated and confirm it persists after page reload.
- Edit each field inline and confirm changes save correctly.
- Delete a certification and confirm it is removed.
- Upload a document to a certification and confirm the file link works.
- Add a certification with a past expiry date and confirm the "Expired" badge appears.
- Add a certification with an expiry date within 90 days and confirm "Expiring soon" badge appears.
- Confirm that an employee can add/edit/delete their own certifications.
- Confirm that the certifications array in `workInfo` JSON does not interfere with other `workInfo` fields (assets, salary history, pension, etc.).
