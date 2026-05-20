/**
 * Build the per-employee S3 prefix used to scope uploads. Format:
 *
 *   people/<slug-of-name>-<short-id>
 *
 * The short ID suffix avoids collisions when two employees share the same
 * displayable name (e.g. two "John Smith"s). The slug is purely cosmetic —
 * it makes the S3 console browsable. The suffix is the load-bearing bit.
 *
 * Importable from both server and client (no Node-only deps).
 */
export function peopleFolder(employee: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const name = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const idSuffix = employee.id.slice(-8);
  const slug = name || 'employee';
  return `people/${slug}-${idSuffix}`;
}

/**
 * Sub-folders under the per-person prefix. Keep the set small and stable —
 * each one shows up as a folder in the S3 console.
 */
export const PEOPLE_SUBFOLDER = {
  profileDocs: 'profile_docs',
  avatars: 'avatars',
  expenses: 'expenses',
} as const;

export function profileDocsFolder(employee: { id: string; firstName?: string | null; lastName?: string | null }): string {
  return `${peopleFolder(employee)}/${PEOPLE_SUBFOLDER.profileDocs}`;
}
export function avatarsFolder(employee: { id: string; firstName?: string | null; lastName?: string | null }): string {
  return `${peopleFolder(employee)}/${PEOPLE_SUBFOLDER.avatars}`;
}
export function expensesFolder(employee: { id: string; firstName?: string | null; lastName?: string | null }): string {
  return `${peopleFolder(employee)}/${PEOPLE_SUBFOLDER.expenses}`;
}
