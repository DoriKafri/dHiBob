import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const db = {
  payRun: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

function makeCtx() {
  return {
    db: db as any,
    session: {
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN',
               companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
      expires: '',
    },
    user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN',
             companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
  };
}

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/server/trpc', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
  const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
  });
  return { router: t.router, publicProcedure: t.procedure,
           protectedProcedure: t.procedure.use(isAuthed) };
});

import { payrollRouter } from '@/server/routers/payroll';

function createCaller(ctx: any) {
  return payrollRouter.createCaller(ctx);
}

const mockPayRun = {
  id: 'run-1',
  companyId: 'co-1',
  periodStart: new Date('2026-03-01'),
  periodEnd: new Date('2026-03-15'),
  totalAmount: 184_230,
  currency: 'USD',
  employeeCount: 28,
  status: 'COMPLETED',
  processedAt: new Date('2026-03-15'),
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-15'),
};

describe('payrollRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // PR-1: listPayRuns returns pay runs filtered by companyId
  it('PR-1: listPayRuns returns pay runs scoped to companyId', async () => {
    db.payRun.findMany.mockResolvedValue([mockPayRun]);
    const caller = createCaller(makeCtx());
    const result = await caller.listPayRuns({ limit: 10 });
    expect(result.payRuns).toHaveLength(1);
    expect(result.payRuns[0].id).toBe('run-1');
    expect(db.payRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1' }) })
    );
    expect(result.nextCursor).toBeUndefined();
  });

  // PR-2: listPayRuns applies status filter
  it('PR-2: listPayRuns applies status filter when provided', async () => {
    db.payRun.findMany.mockResolvedValue([mockPayRun]);
    const caller = createCaller(makeCtx());
    const result = await caller.listPayRuns({ limit: 10, status: 'COMPLETED' });
    expect(db.payRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED' }) })
    );
    expect(result.payRuns).toHaveLength(1);
  });

  // PR-3: listPayRuns returns empty array when no pay runs exist
  it('PR-3: listPayRuns returns empty array when no pay runs exist', async () => {
    db.payRun.findMany.mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    const result = await caller.listPayRuns({ limit: 10 });
    expect(result.payRuns).toHaveLength(0);
    expect(result.nextCursor).toBeUndefined();
  });

  // PR-4: listPayRuns returns nextCursor when result set exceeds limit
  it('PR-4: listPayRuns returns nextCursor when result exceeds limit', async () => {
    db.payRun.findMany.mockResolvedValue([
      { ...mockPayRun, id: 'run-1' },
      { ...mockPayRun, id: 'run-2' },
      { ...mockPayRun, id: 'run-3' },
    ]);
    const caller = createCaller(makeCtx());
    const result = await caller.listPayRuns({ limit: 2 });
    expect(result.payRuns).toHaveLength(2);
    expect(result.nextCursor).toBe('run-3');
  });

  // PR-5: listPayRuns does NOT include pay runs from another company
  it('PR-5: listPayRuns scopes query to caller company only', async () => {
    db.payRun.findMany.mockResolvedValue([mockPayRun]);
    const caller = createCaller(makeCtx());
    await caller.listPayRuns({ limit: 10 });
    expect(db.payRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1' }) })
    );
    expect(db.payRun.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-2' }) })
    );
  });

  // getSummary tests setup
  const currentYear = new Date().getFullYear();
  const completedRun1 = {
    ...mockPayRun, id: 'run-1', status: 'COMPLETED',
    periodStart: new Date(`${currentYear}-01-01`), totalAmount: 180_000, employeeCount: 28,
    periodEnd: new Date(`${currentYear}-01-15`), processedAt: new Date(`${currentYear}-01-15`),
  };
  const completedRun2 = {
    ...mockPayRun, id: 'run-2', status: 'COMPLETED',
    periodStart: new Date(`${currentYear}-01-16`), totalAmount: 182_000, employeeCount: 28,
    periodEnd: new Date(`${currentYear}-01-31`), processedAt: new Date(`${currentYear}-01-31`),
  };
  const pendingRun = {
    ...mockPayRun, id: 'run-3', status: 'PENDING',
    periodStart: new Date(`${currentYear}-02-01`), periodEnd: new Date(`${currentYear}-02-15`),
    processedAt: null, totalAmount: 0, employeeCount: 0,
  };

  // PR-6: getSummary returns correct totalPayrollYTD
  it('PR-6: getSummary returns correct totalPayrollYTD for COMPLETED runs this year', async () => {
    db.payRun.findMany.mockResolvedValue([pendingRun, completedRun2, completedRun1]);
    const caller = createCaller(makeCtx());
    const result = await caller.getSummary();
    expect(result.totalPayrollYTD).toBe(362_000);
  });

  // PR-7: getSummary returns employeeCount from most recent COMPLETED run
  it('PR-7: getSummary returns employeeCount from most recent COMPLETED run', async () => {
    db.payRun.findMany.mockResolvedValue([pendingRun, completedRun2, completedRun1]);
    const caller = createCaller(makeCtx());
    const result = await caller.getSummary();
    expect(result.employeeCount).toBe(28);
  });

  // PR-8: getSummary returns nextRunDate as periodEnd + 1 day of most recent COMPLETED run
  it('PR-8: getSummary returns nextRunDate as periodEnd + 1 day of most recent COMPLETED run', async () => {
    db.payRun.findMany.mockResolvedValue([pendingRun, completedRun2, completedRun1]);
    const caller = createCaller(makeCtx());
    const result = await caller.getSummary();
    const expected = new Date(`${currentYear}-02-01`);
    expect(result.nextRunDate?.toDateString()).toBe(expected.toDateString());
  });

  // PR-9: getSummary returns pendingCount
  it('PR-9: getSummary returns pendingCount as count of PENDING runs', async () => {
    db.payRun.findMany.mockResolvedValue([pendingRun, completedRun2, completedRun1]);
    const caller = createCaller(makeCtx());
    const result = await caller.getSummary();
    expect(result.pendingCount).toBe(1);
  });

  // PR-10: getSummary returns zeros when no pay runs
  it('PR-10: getSummary returns zeroed summary when no pay runs exist', async () => {
    db.payRun.findMany.mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    const result = await caller.getSummary();
    expect(result.totalPayrollYTD).toBe(0);
    expect(result.employeeCount).toBe(0);
    expect(result.nextRunDate).toBeNull();
    expect(result.pendingCount).toBe(0);
  });

  // PR-11: createPayRun creates with status PENDING and injects companyId
  it('PR-11: createPayRun creates pay run with PENDING status and injects companyId from context', async () => {
    const createdRun = { ...mockPayRun, id: 'run-new', status: 'PENDING', processedAt: null };
    db.payRun.create.mockResolvedValue(createdRun);
    const caller = createCaller(makeCtx());
    const result = await caller.createPayRun({
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-04-15'),
      totalAmount: 185_000,
      currency: 'USD',
      employeeCount: 28,
    });
    expect(result.status).toBe('PENDING');
    expect(db.payRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'co-1', status: 'PENDING' }),
      })
    );
  });

  // PR-12: createPayRun throws BAD_REQUEST when periodStart >= periodEnd
  it('PR-12: createPayRun throws BAD_REQUEST when periodStart >= periodEnd', async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.createPayRun({
        periodStart: new Date('2026-04-15'),
        periodEnd: new Date('2026-04-01'),
        totalAmount: 185_000,
        currency: 'USD',
        employeeCount: 28,
      })
    ).rejects.toThrow(TRPCError);
  });

  // PR-13: createPayRun does NOT call prisma when validation fails
  it('PR-13: createPayRun does not call prisma.payRun.create when validation fails', async () => {
    const caller = createCaller(makeCtx());
    try {
      await caller.createPayRun({
        periodStart: new Date('2026-04-15'),
        periodEnd: new Date('2026-04-01'),
        totalAmount: 185_000,
        currency: 'USD',
        employeeCount: 28,
      });
    } catch {}
    expect(db.payRun.create).not.toHaveBeenCalled();
  });
});
