import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// -----------------------------------------------------------------------
// Minimal in-memory mock for Prisma (no live DB needed for unit tests)
// -----------------------------------------------------------------------

const db = {
  reviewCycle:       { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  performanceReview: { create: vi.fn() },
  goal:              { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  employee:          { findUnique: vi.fn() },
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

import { performanceRouter } from '@/server/routers/performance';

function createCaller(ctx: any) {
  return performanceRouter.createCaller(ctx);
}

// Standard mock shapes
const mockCycleRecord = {
  id: 'cycle-1',
  name: 'H1 2026 Review',
  companyId: 'co-1',
  type: 'ANNUAL',
  status: 'DRAFT',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-06-30'),
  createdAt: new Date('2026-01-01'),
  _count: { reviews: 3 },
};

const mockGoalRecord = {
  id: 'goal-1',
  title: 'Increase test coverage to 80%',
  description: 'Write more unit tests',
  employeeId: 'emp-1',
  companyId: 'co-1',
  type: 'INDIVIDUAL',
  status: 'ACTIVE',
  progress: 65,
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-03-31'),
  createdAt: new Date('2026-01-01'),
  keyResults: [
    { id: 'kr-1', goalId: 'goal-1', title: 'Write 50 new tests', completed: false },
  ],
};

const mockEmployeeRecord = { id: 'emp-1', companyId: 'co-1', firstName: 'Alice', lastName: 'Smith' };

const mockReviewRecord = {
  id: 'rev-1',
  cycleId: 'cycle-1',
  employeeId: 'emp-1',
  reviewerId: 'emp-1',
  type: 'MANAGER',
  rating: 4,
  responses: '{}',
  status: 'SUBMITTED',
  submittedAt: new Date(),
  employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith' },
};

describe('performanceRouter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // -----------------------------------------------------------------------
  // P-1: listCycles returns cycles filtered by companyId, includes _count.reviews
  // -----------------------------------------------------------------------
  describe('listCycles', () => {
    it('P-1: returns cycles filtered by companyId, includes _count.reviews', async () => {
      db.reviewCycle.findMany.mockResolvedValue([mockCycleRecord]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCycles({ limit: 10 });

      expect(result.cycles).toHaveLength(1);
      expect(result.cycles[0].name).toBe('H1 2026 Review');
      expect(result.cycles[0]._count.reviews).toBe(3);
      expect(db.reviewCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1' }) })
      );
      expect(result.nextCursor).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // P-2: listCycles applies status filter when provided
    // -----------------------------------------------------------------------
    it('P-2: applies status filter when provided', async () => {
      db.reviewCycle.findMany.mockResolvedValue([{ ...mockCycleRecord, status: 'ACTIVE' }]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCycles({ status: 'ACTIVE', limit: 10 });

      expect(db.reviewCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1', status: 'ACTIVE' }) })
      );
      expect(result.cycles[0].status).toBe('ACTIVE');
    });

    // -----------------------------------------------------------------------
    // P-3: listCycles returns empty array when no cycles exist
    // -----------------------------------------------------------------------
    it('P-3: returns empty array when no cycles exist', async () => {
      db.reviewCycle.findMany.mockResolvedValue([]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCycles({ limit: 10 });

      expect(result.cycles).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // P-4: listCycles returns nextCursor when result set exceeds limit
    // -----------------------------------------------------------------------
    it('P-4: returns nextCursor when result set exceeds limit', async () => {
      db.reviewCycle.findMany.mockResolvedValue([
        { ...mockCycleRecord, id: 'cycle-1' },
        { ...mockCycleRecord, id: 'cycle-2' },
        { ...mockCycleRecord, id: 'cycle-3' },
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCycles({ limit: 2 });

      expect(result.cycles).toHaveLength(2);
      expect(result.nextCursor).toBe('cycle-3');
    });
  });

  // -----------------------------------------------------------------------
  // P-5: createCycle creates cycle with all fields, returns record with _count.reviews = 0
  // -----------------------------------------------------------------------
  describe('createCycle', () => {
    it('P-5: creates cycle with all fields, returns record with _count.reviews = 0', async () => {
      db.reviewCycle.create.mockResolvedValue({
        ...mockCycleRecord,
        name: 'Q1 Review',
        type: 'QUARTERLY',
        status: 'DRAFT',
        _count: { reviews: 0 },
      });

      const caller = createCaller(makeCtx());
      const result = await caller.createCycle({
        name: 'Q1 Review',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
        type: 'QUARTERLY',
        status: 'DRAFT',
      });

      expect(result.name).toBe('Q1 Review');
      expect(result._count.reviews).toBe(0);
      expect(db.reviewCycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 'co-1', name: 'Q1 Review' }),
        })
      );
      expect(db.reviewCycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { _count: { select: { reviews: true } } },
        })
      );
    });

    // -----------------------------------------------------------------------
    // P-6: createCycle throws BAD_REQUEST when startDate >= endDate
    // -----------------------------------------------------------------------
    it('P-6: throws BAD_REQUEST when startDate >= endDate', async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.createCycle({
          name: 'Bad Cycle',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-01-01'),
          type: 'ANNUAL',
          status: 'DRAFT',
        })
      ).rejects.toThrow(TRPCError);

      let error: TRPCError | null = null;
      try {
        await caller.createCycle({
          name: 'Bad Cycle',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-01-01'),
          type: 'ANNUAL',
          status: 'DRAFT',
        });
      } catch (e) {
        error = e as TRPCError;
      }
      expect(error?.code).toBe('BAD_REQUEST');
      expect(db.reviewCycle.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-7: createCycle injects companyId from context, not from input
    // -----------------------------------------------------------------------
    it('P-7: injects companyId from context, not from input', async () => {
      db.reviewCycle.create.mockResolvedValue({ ...mockCycleRecord, companyId: 'co-1', name: 'New Cycle' });

      const caller = createCaller(makeCtx());
      await caller.createCycle({
        name: 'New Cycle',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(db.reviewCycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 'co-1' }),
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // P-8: submitReview creates review and returns record with employee include
  // -----------------------------------------------------------------------
  describe('submitReview', () => {
    it('P-8: creates review and returns record with employee include', async () => {
      db.reviewCycle.findUnique.mockResolvedValue({ id: 'cycle-1', companyId: 'co-1' });
      db.employee.findUnique.mockResolvedValue(mockEmployeeRecord);
      db.performanceReview.create.mockResolvedValue(mockReviewRecord);

      const caller = createCaller(makeCtx());
      const result = await caller.submitReview({ cycleId: 'cycle-1', employeeId: 'emp-1', rating: 4, responses: '{}' });

      expect(result.id).toBe('rev-1');
      expect(result.rating).toBe(4);
      expect((result as any).employee.firstName).toBe('Alice');
      expect((result as any).type).toBe('MANAGER');
      expect(db.performanceReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        })
      );
    });

    // -----------------------------------------------------------------------
    // P-9: submitReview throws NOT_FOUND when cycleId does not exist
    // -----------------------------------------------------------------------
    it('P-9: throws NOT_FOUND when cycleId does not exist', async () => {
      db.reviewCycle.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.submitReview({ cycleId: 'nonexistent', employeeId: 'emp-1', rating: 3 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('NOT_FOUND');
      expect(db.employee.findUnique).not.toHaveBeenCalled();
      expect(db.performanceReview.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-10: submitReview throws NOT_FOUND when employeeId does not exist
    // -----------------------------------------------------------------------
    it('P-10: throws NOT_FOUND when employeeId does not exist', async () => {
      db.reviewCycle.findUnique.mockResolvedValue({ id: 'cycle-1', companyId: 'co-1' });
      db.employee.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.submitReview({ cycleId: 'cycle-1', employeeId: 'nonexistent', rating: 3 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('NOT_FOUND');
      expect(db.performanceReview.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-11: submitReview throws FORBIDDEN when cycle belongs to a different company
    // -----------------------------------------------------------------------
    it('P-11: throws FORBIDDEN when cycle belongs to a different company', async () => {
      db.reviewCycle.findUnique.mockResolvedValue({ id: 'cycle-other', companyId: 'co-2' });

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.submitReview({ cycleId: 'cycle-other', employeeId: 'emp-1', rating: 3 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('FORBIDDEN');
      expect(db.employee.findUnique).not.toHaveBeenCalled();
      expect(db.performanceReview.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-12: submitReview throws FORBIDDEN when employee belongs to a different company
    // -----------------------------------------------------------------------
    it('P-12: throws FORBIDDEN when employee belongs to a different company', async () => {
      db.reviewCycle.findUnique.mockResolvedValue({ id: 'cycle-1', companyId: 'co-1' });
      db.employee.findUnique.mockResolvedValue({ id: 'emp-other', companyId: 'co-2' });

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.submitReview({ cycleId: 'cycle-1', employeeId: 'emp-other', rating: 3 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('FORBIDDEN');
      expect(db.performanceReview.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // P-13: listGoals returns goals with keyResults for a valid employee
  // -----------------------------------------------------------------------
  describe('listGoals', () => {
    it('P-13: returns goals with keyResults for a valid employee', async () => {
      db.employee.findUnique.mockResolvedValue(mockEmployeeRecord);
      db.goal.findMany.mockResolvedValue([mockGoalRecord]);

      const caller = createCaller(makeCtx());
      const result = await caller.listGoals({ employeeId: 'emp-1', limit: 10 });

      expect(result.goals).toHaveLength(1);
      expect(result.goals[0].title).toBe('Increase test coverage to 80%');
      expect(result.goals[0].keyResults).toHaveLength(1);
      expect((result.goals[0].keyResults as any[])[0].title).toBe('Write 50 new tests');
      expect(db.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { keyResults: true } })
      );
      expect(db.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ employeeId: 'emp-1' }) })
      );
      expect(result.nextCursor).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // P-14: listGoals throws NOT_FOUND when employeeId does not exist
    // -----------------------------------------------------------------------
    it('P-14: throws NOT_FOUND when employeeId does not exist', async () => {
      db.employee.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.listGoals({ employeeId: 'nonexistent', limit: 10 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('NOT_FOUND');
      expect(db.goal.findMany).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-15: listGoals throws FORBIDDEN when employee belongs to a different company
    // -----------------------------------------------------------------------
    it('P-15: throws FORBIDDEN when employee belongs to a different company', async () => {
      db.employee.findUnique.mockResolvedValue({ id: 'emp-other', companyId: 'co-2' });

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.listGoals({ employeeId: 'emp-other', limit: 10 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('FORBIDDEN');
      expect(db.goal.findMany).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-16: listGoals applies status filter when provided
    // -----------------------------------------------------------------------
    it('P-16: applies status filter when provided', async () => {
      db.employee.findUnique.mockResolvedValue(mockEmployeeRecord);
      db.goal.findMany.mockResolvedValue([{ ...mockGoalRecord, status: 'ACTIVE' }]);

      const caller = createCaller(makeCtx());
      const result = await caller.listGoals({ employeeId: 'emp-1', status: 'ACTIVE', limit: 10 });

      expect(db.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ employeeId: 'emp-1', status: 'ACTIVE' }) })
      );
      expect(result.goals[0].status).toBe('ACTIVE');
    });
  });

  // -----------------------------------------------------------------------
  // P-17: createGoal creates goal, returns record including keyResults (verifies Bug 1 fix)
  // -----------------------------------------------------------------------
  describe('createGoal', () => {
    it('P-17: creates goal, returns record including keyResults (verifies Bug 1 fix)', async () => {
      db.employee.findUnique.mockResolvedValue(mockEmployeeRecord);
      db.goal.create.mockResolvedValue({
        ...mockGoalRecord,
        id: 'goal-new',
        title: 'Launch new onboarding flow',
        status: 'ACTIVE',
        progress: 0,
        keyResults: [],
      });

      const caller = createCaller(makeCtx());
      const result = await caller.createGoal({
        employeeId: 'emp-1',
        title: 'Launch new onboarding flow',
        description: 'Redesign the flow',
        startDate: new Date('2026-01-01'),
        dueDate: new Date('2026-03-31'),
        type: 'INDIVIDUAL',
      });

      expect(result.title).toBe('Launch new onboarding flow');
      expect(result.status).toBe('ACTIVE');
      expect(result.progress).toBe(0);
      expect(result).toHaveProperty('keyResults');
      expect(Array.isArray(result.keyResults)).toBe(true);
      expect(db.goal.create).toHaveBeenCalledWith(
        expect.objectContaining({ include: { keyResults: true } })
      );
      expect(db.goal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ employeeId: 'emp-1', companyId: 'co-1', status: 'ACTIVE', progress: 0 }),
        })
      );
    });

    // -----------------------------------------------------------------------
    // P-18: createGoal throws NOT_FOUND when employeeId does not exist
    // -----------------------------------------------------------------------
    it('P-18: throws NOT_FOUND when employeeId does not exist', async () => {
      db.employee.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.createGoal({
          employeeId: 'nonexistent',
          title: 'Some Goal',
          startDate: new Date('2026-01-01'),
          dueDate: new Date('2026-06-30'),
        });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('NOT_FOUND');
      expect(db.goal.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-19: createGoal throws FORBIDDEN when employee belongs to a different company
    // -----------------------------------------------------------------------
    it('P-19: throws FORBIDDEN when employee belongs to a different company', async () => {
      db.employee.findUnique.mockResolvedValue({ id: 'emp-other', companyId: 'co-2' });

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.createGoal({
          employeeId: 'emp-other',
          title: 'Some Goal',
          startDate: new Date('2026-01-01'),
          dueDate: new Date('2026-06-30'),
        });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('FORBIDDEN');
      expect(db.goal.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // P-20: updateGoalProgress updates progress and returns updated goal
  // -----------------------------------------------------------------------
  describe('updateGoalProgress', () => {
    it('P-20: updates progress and returns updated goal', async () => {
      db.goal.findUnique.mockResolvedValue({
        id: 'goal-1', employeeId: 'emp-1', progress: 65,
        employee: { id: 'emp-1', companyId: 'co-1' },
      });
      db.goal.update.mockResolvedValue({ id: 'goal-1', progress: 80, employeeId: 'emp-1' });

      const caller = createCaller(makeCtx());
      const result = await caller.updateGoalProgress({ goalId: 'goal-1', progress: 80 });

      expect(result.progress).toBe(80);
      expect(db.goal.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'goal-1' }, include: { employee: true } })
      );
      expect(db.goal.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'goal-1' }, data: { progress: 80, status: 'ACTIVE' } })
      );
    });

    // -----------------------------------------------------------------------
    // P-21: updateGoalProgress throws NOT_FOUND when goalId does not exist
    // -----------------------------------------------------------------------
    it('P-21: throws NOT_FOUND when goalId does not exist', async () => {
      db.goal.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.updateGoalProgress({ goalId: 'nonexistent', progress: 50 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('NOT_FOUND');
      expect(db.goal.update).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // P-22: updateGoalProgress throws FORBIDDEN when goal's employee belongs to a different company
    // -----------------------------------------------------------------------
    it('P-22: throws FORBIDDEN when goal employee belongs to a different company', async () => {
      db.goal.findUnique.mockResolvedValue({
        id: 'goal-other', employeeId: 'emp-other', progress: 20,
        employee: { id: 'emp-other', companyId: 'co-2' },
      });

      const caller = createCaller(makeCtx());
      let error: TRPCError | null = null;
      try {
        await caller.updateGoalProgress({ goalId: 'goal-other', progress: 50 });
      } catch (e) {
        error = e as TRPCError;
      }

      expect(error).toBeInstanceOf(TRPCError);
      expect(error?.code).toBe('FORBIDDEN');
      expect(db.goal.update).not.toHaveBeenCalled();
    });
  });
});
