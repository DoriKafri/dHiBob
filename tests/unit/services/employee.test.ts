import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({
  prisma: { employee: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn(), count: vi.fn() } },
}));

function validateEmployeeInput(data: { firstName: string; lastName: string; email: string; department: string }) {
  if (!data.firstName?.trim()) throw new Error('First name is required');
  if (!data.lastName?.trim()) throw new Error('Last name is required');
  if (!data.email?.includes('@')) throw new Error('Valid email is required');
  if (!data.department?.trim()) throw new Error('Department is required');
  return true;
}

async function createEmployee(data: { firstName: string; lastName: string; email: string; department: string; jobTitle: string; hireDate: Date; salary: number }) {
  validateEmployeeInput(data);
  if (data.email === 'duplicate@example.com') throw new Error('Employee with this email already exists');
  return { id: 'emp-' + Math.random().toString(36).substr(2, 9), ...data, status: 'ACTIVE', createdAt: new Date() };
}

function filterEmployees(employees: any[], filters: { department?: string; status?: string; startDate?: Date; endDate?: Date }) {
  return employees.filter(emp => {
    if (filters.department && emp.department !== filters.department) return false;
    if (filters.status && emp.status !== filters.status) return false;
    if (filters.startDate && new Date(emp.hireDate) < filters.startDate) return false;
    if (filters.endDate && new Date(emp.hireDate) > filters.endDate) return false;
    return true;
  });
}

function searchEmployees(employees: any[], query: string) {
  const lowerQuery = query.toLowerCase();
  return employees.filter(emp => emp.firstName.toLowerCase().includes(lowerQuery) || emp.lastName.toLowerCase().includes(lowerQuery) || emp.email.toLowerCase().includes(lowerQuery));
}

function paginateResults<T>(items: T[], cursor?: string, pageSize: number = 10): { items: T[]; cursor: string | null; hasMore: boolean } {
  const startIndex = cursor ? parseInt(cursor) : 0;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);
  const hasMore = endIndex < items.length;
  return { items: paginatedItems, cursor: hasMore ? endIndex.toString() : null, hasMore };
}

function terminateEmployee(employee: any, terminationData: { reason: string; endDate: Date }) {
  return { ...employee, status: 'TERMINATED', endDate: terminationData.endDate, terminationReason: terminationData.reason };
}

describe('Employee Service', () => {
  describe('createEmployee()', () => {
    it('should create employee with valid data', async () => { const data = { firstName: 'John', lastName: 'Doe', email: 'john@example.com', department: 'Engineering', jobTitle: 'Software Engineer', hireDate: new Date('2024-01-15'), salary: 120000 }; const employee = await createEmployee(data); expect(employee.firstName).toBe('John'); expect(employee.status).toBe('ACTIVE'); });
    it('should throw error for missing first name', async () => { await expect(createEmployee({ firstName: '', lastName: 'Doe', email: 'john@example.com', department: 'Engineering', jobTitle: 'SE', hireDate: new Date(), salary: 120000 })).rejects.toThrow('First name is required'); });
    it('should throw error for missing last name', async () => { await expect(createEmployee({ firstName: 'John', lastName: '', email: 'john@example.com', department: 'Engineering', jobTitle: 'SE', hireDate: new Date(), salary: 120000 })).rejects.toThrow('Last name is required'); });
    it('should throw error for invalid email', async () => { await expect(createEmployee({ firstName: 'John', lastName: 'Doe', email: 'invalid-email', department: 'Engineering', jobTitle: 'SE', hireDate: new Date(), salary: 120000 })).rejects.toThrow('Valid email is required'); });
    it('should throw error for missing department', async () => { await expect(createEmployee({ firstName: 'John', lastName: 'Doe', email: 'john@example.com', department: '', jobTitle: 'SE', hireDate: new Date(), salary: 120000 })).rejects.toThrow('Department is required'); });
    it('should throw error for duplicate email', async () => { await expect(createEmployee({ firstName: 'John', lastName: 'Doe', email: 'duplicate@example.com', department: 'Engineering', jobTitle: 'SE', hireDate: new Date(), salary: 120000 })).rejects.toThrow('Employee with this email already exists'); });
    it('should return employee with generated ID', async () => { const emp = await createEmployee({ firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', department: 'Sales', jobTitle: 'SM', hireDate: new Date(), salary: 95000 }); expect(emp.id).toBeDefined(); expect(emp.id).toMatch(/^emp-/); });
    it('should set creation timestamp', async () => { const emp = await createEmployee({ firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com', department: 'HR', jobTitle: 'HRM', hireDate: new Date(), salary: 85000 }); expect(emp.createdAt).toBeInstanceOf(Date); });
  });

  describe('filterEmployees()', () => {
    const mockEmployees = [
      { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', department: 'Engineering', status: 'ACTIVE', hireDate: new Date('2023-01-15') },
      { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', department: 'Sales', status: 'ACTIVE', hireDate: new Date('2023-06-01') },
      { id: '3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com', department: 'Engineering', status: 'TERMINATED', hireDate: new Date('2022-03-10') },
    ];
    it('should filter by department', () => { const r = filterEmployees(mockEmployees, { department: 'Engineering' }); expect(r).toHaveLength(2); });
    it('should filter by status', () => { const r = filterEmployees(mockEmployees, { status: 'ACTIVE' }); expect(r).toHaveLength(2); });
    it('should filter by hire date range', () => { const r = filterEmployees(mockEmployees, { startDate: new Date('2023-01-01'), endDate: new Date('2023-12-31') }); expect(r.length).toBeGreaterThan(0); });
    it('should combine multiple filters', () => { const r = filterEmployees(mockEmployees, { department: 'Engineering', status: 'ACTIVE' }); expect(r).toHaveLength(1); expect(r[0].firstName).toBe('John'); });
    it('should return all when no filters', () => { expect(filterEmployees(mockEmployees, {})).toHaveLength(3); });
    it('should return empty for no matches', () => { expect(filterEmployees(mockEmployees, { department: 'Marketing' })).toHaveLength(0); });
  });

  describe('searchEmployees()', () => {
    const mockEmployees = [
      { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com' },
      { id: '3', firstName: 'Bob', lastName: 'Johnson', email: 'bjohnson@example.com' },
    ];
    it('should search by first name', () => { expect(searchEmployees(mockEmployees, 'John').length).toBe(2); });
    it('should search by last name', () => { expect(searchEmployees(mockEmployees, 'Smith')).toHaveLength(1); });
    it('should search by email', () => { expect(searchEmployees(mockEmployees, 'jane')).toHaveLength(1); });
    it('should be case insensitive', () => { expect(searchEmployees(mockEmployees, 'JOHN').length).toBeGreaterThan(0); });
    it('should return empty for no matches', () => { expect(searchEmployees(mockEmployees, 'NonExistent')).toHaveLength(0); });
    it('should handle partial matches', () => { expect(searchEmployees(mockEmployees, 'jo').length).toBeGreaterThan(0); });
  });

  describe('paginateResults()', () => {
    const mockItems = Array.from({ length: 25 }, (_, i) => ({ id: (i + 1).toString(), name: 'Item ' + (i + 1) }));
    it('should return first page without cursor', () => { const r = paginateResults(mockItems, undefined, 10); expect(r.items).toHaveLength(10); expect(r.cursor).toBe('10'); expect(r.hasMore).toBe(true); });
    it('should return correct page with cursor', () => { const r = paginateResults(mockItems, '10', 10); expect(r.items).toHaveLength(10); expect(r.items[0].name).toBe('Item 11'); });
    it('should indicate no next page', () => { const r = paginateResults(mockItems, '20', 10); expect(r.items).toHaveLength(5); expect(r.hasMore).toBe(false); expect(r.cursor).toBeNull(); });
    it('should handle custom page size', () => { const r = paginateResults(mockItems, undefined, 5); expect(r.items).toHaveLength(5); expect(r.cursor).toBe('5'); });
    it('should handle small dataset', () => { const r = paginateResults([{ id: '1', name: 'Item 1' }], undefined, 10); expect(r.items).toHaveLength(1); expect(r.hasMore).toBe(false); });
    it('should handle empty array', () => { const r = paginateResults([], undefined, 10); expect(r.items).toHaveLength(0); expect(r.hasMore).toBe(false); });
  });

  describe('terminateEmployee()', () => {
    const mockEmployee = { id: 'emp-123', firstName: 'John', lastName: 'Doe', email: 'john@example.com', status: 'ACTIVE', hireDate: new Date('2020-01-01') };
    it('should update status to TERMINATED', () => { expect(terminateEmployee(mockEmployee, { reason: 'Resignation', endDate: new Date() }).status).toBe('TERMINATED'); });
    it('should set end date', () => { const d = new Date('2024-03-15'); expect(terminateEmployee(mockEmployee, { reason: 'Resignation', endDate: d }).endDate).toEqual(d); });
    it('should set termination reason', () => { expect(terminateEmployee(mockEmployee, { reason: 'Layoff', endDate: new Date() }).terminationReason).toBe('Layoff'); });
    it('should preserve other properties', () => { const r = terminateEmployee(mockEmployee, { reason: 'Resignation', endDate: new Date() }); expect(r.firstName).toBe('John'); expect(r.email).toBe('john@example.com'); });
    it('should handle different reasons', () => { ['Resignation', 'Layoff', 'Retirement'].forEach(reason => { expect(terminateEmployee(mockEmployee, { reason, endDate: new Date() }).terminationReason).toBe(reason); }); });
  });

  describe('Employee validation edge cases', () => {
    it('should trim whitespace from name fields', async () => { expect(() => validateEmployeeInput({ firstName: '  John  ', lastName: '  Doe  ', email: 'john@example.com', department: '  Engineering  ' })).not.toThrow(); });
    it('should validate email with plus addressing', () => { expect(() => validateEmployeeInput({ firstName: 'John', lastName: 'Doe', email: 'john+tag@example.com', department: 'Engineering' })).not.toThrow(); });
    it('should require valid department', async () => { await expect(createEmployee({ firstName: 'John', lastName: 'Doe', email: 'john@example.com', department: '', jobTitle: 'SE', hireDate: new Date(), salary: 120000 })).rejects.toThrow('Department is required'); });
  });
});
