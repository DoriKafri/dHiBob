import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../../src/server/routers/_app';
import { prisma } from '../../../src/lib/db';

vi.mock('../../../src/lib/db', () => ({
  prisma: {
    employee: {
      findMany: vi.fn(),
    }
  },
}));

describe('Compensation Router', () => {
  it('should fetch company stats', async () => {
    const caller = appRouter.createCaller({ 
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    (prisma.employee.findMany as any).mockResolvedValue([
      {
        id: 'emp-1',
        companyId: 'company-1',
        status: 'ACTIVE',
        compensationHistory: [
          { amount: 120000, effectiveDate: new Date('2023-01-01') }
        ]
      }
    ]);

    const result = await caller.compensation.getStats();
    expect(result).toBeDefined();
    expect(prisma.employee.findMany).toHaveBeenCalled();
  });
});