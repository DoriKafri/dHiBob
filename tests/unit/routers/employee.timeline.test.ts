import { describe, it, expect, vi, beforeEach } from 'vitest';
import { employeeRouter } from '../../../src/server/routers/employee';

describe('employeeRouter.getTimeline', () => {
  const mockCtx = {
    db: {
      employee: {
        findUnique: vi.fn(),
      },
      jobRecord: {
        findMany: vi.fn(),
      },
      compensationRecord: {
        findMany: vi.fn(),
      },
    },
    user: { id: 'u1', employeeId: 'admin-emp-id', companyId: 'c1', role: 'ADMIN' },
    session: { user: { id: 'u1', employeeId: 'admin-emp-id', companyId: 'c1', role: 'ADMIN' } }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return merged and sorted timeline events', async () => {
    const employeeId = 'emp-1';
    (mockCtx.db.employee.findUnique as any).mockResolvedValue({ id: employeeId, companyId: 'c1', managerId: 'mgr-1' });
    
    (mockCtx.db.jobRecord.findMany as any).mockResolvedValue([
      { id: 'j1', type: 'HIRED', effectiveDate: new Date('2022-01-01'), title: 'Junior Dev', description: 'Started', metadata: '{}' },
      { id: 'j2', type: 'PROMOTION', effectiveDate: new Date('2023-01-01'), title: 'Senior Dev', description: 'Promoted', metadata: '{}' },
    ]);

    (mockCtx.db.compensationRecord.findMany as any).mockResolvedValue([
      { id: 'c1', type: 'BASE_SALARY', effectiveDate: new Date('2022-01-01'), salary: 50000, currency: 'USD', changeReason: 'Initial' },
    ]);

    const caller = employeeRouter.createCaller(mockCtx as any);
    const result = await caller.getTimeline({ id: employeeId });

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('PROMOTION'); // Descending order
    expect(result[0].isSensitive).toBe(false);
    expect(result[2].type).toBe('COMPENSATION');
    expect(result[2].isSensitive).toBe(true);
  });

  it('should filter sensitive records for regular employees', async () => {
    const employeeId = 'emp-1';
    const otherUserId = 'other-user-id';
    
    const restrictedUser = { id: 'u2', employeeId: otherUserId, companyId: 'c1', role: 'EMPLOYEE' };
    const restrictedCtx = {
      ...mockCtx,
      user: restrictedUser,
      session: { user: restrictedUser }
    };

    (mockCtx.db.employee.findUnique as any).mockResolvedValue({ id: employeeId, companyId: 'c1', managerId: 'mgr-1' });
    (mockCtx.db.jobRecord.findMany as any).mockResolvedValue([{ id: 'j1', type: 'HIRED', effectiveDate: new Date('2022-01-01'), title: 'Junior Dev', metadata: '{}' }]);
    (mockCtx.db.compensationRecord.findMany as any).mockResolvedValue([{ id: 'c1', type: 'BASE_SALARY', effectiveDate: new Date('2022-01-01'), salary: 50000 }]);

    const caller = employeeRouter.createCaller(restrictedCtx as any);
    const result = await caller.getTimeline({ id: employeeId });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('HIRED');
    // COMPENSATION record should be filtered out
    expect(result.find(r => r.type === 'COMPENSATION')).toBeUndefined();
  });
});
