import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

const createCycleSchema = z.object({
  name: z.string().min(1), startDate: z.coerce.date(), endDate: z.coerce.date(),
  type: z.string().default('ANNUAL'),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).default('DRAFT'),
});
const listCyclesSchema = z.object({
  status: z.string().optional(),
  limit: z.number().min(1).max(100).default(10), cursor: z.string().optional(),
});
const submitReviewSchema = z.object({
  cycleId: z.string(), employeeId: z.string(), rating: z.number().min(1).max(5),
  responses: z.string().optional(),
});
const createGoalSchema = z.object({
  employeeId: z.string(), title: z.string().min(1), description: z.string().optional(),
  startDate: z.coerce.date(), dueDate: z.coerce.date(),
  type: z.string().default('INDIVIDUAL'),
});
const updateGoalProgressSchema = z.object({ goalId: z.string(), progress: z.number().min(0).max(100) });
const listGoalsSchema = z.object({
  employeeId: z.string(), status: z.string().optional(),
  limit: z.number().min(1).max(100).default(10), cursor: z.string().optional(),
});

export const performanceRouter = router({
  listCycles: protectedProcedure.input(listCyclesSchema).query(async ({ ctx, input }) => {
    const { status, limit, cursor } = input;
    const where: any = { companyId: ctx.user.companyId };
    if (status) where.status = status;
    const cycles = await ctx.db.reviewCycle.findMany({
      where, include: { _count: { select: { reviews: true } } },
      orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    let nextCursor: typeof cursor | undefined = undefined;
    if (cycles.length > limit) { const nextItem = cycles.pop(); nextCursor = nextItem?.id; }
    return { cycles, nextCursor };
  }),

  createCycle: protectedProcedure.input(createCycleSchema).mutation(async ({ ctx, input }) => {
    if (input.startDate >= input.endDate) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start date must be before end date' });
    const cycle = await ctx.db.reviewCycle.create({
      data: { ...input, companyId: ctx.user.companyId },
      include: { _count: { select: { reviews: true } } },
    });
    return cycle;
  }),

  submitReview: protectedProcedure.input(submitReviewSchema).mutation(async ({ ctx, input }) => {
    const { cycleId, employeeId, rating, responses } = input;
    const cycle = await ctx.db.reviewCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new TRPCError({ code: 'NOT_FOUND', message: 'Review cycle not found' });
    if (cycle.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    const employee = await ctx.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    const review = await ctx.db.performanceReview.create({
      data: {
        cycleId, employeeId, reviewerId: ctx.user.employeeId ?? employeeId,
        type: 'MANAGER', rating, responses: responses ?? '{}', submittedAt: new Date(),
        status: 'SUBMITTED',
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return review;
  }),

  listGoals: protectedProcedure.input(listGoalsSchema).query(async ({ ctx, input }) => {
    const { employeeId, status, limit, cursor } = input;
    const employee = await ctx.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    const where: any = { employeeId };
    if (status) where.status = status;
    const goals = await ctx.db.goal.findMany({
      where, include: { keyResults: true }, orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    let nextCursor: typeof cursor | undefined = undefined;
    if (goals.length > limit) { const nextItem = goals.pop(); nextCursor = nextItem?.id; }
    return { goals, nextCursor };
  }),

  createGoal: protectedProcedure.input(createGoalSchema).mutation(async ({ ctx, input }) => {
    const { employeeId, title, description, startDate, dueDate, type } = input;
    const employee = await ctx.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    const goal = await ctx.db.goal.create({
      data: { employeeId, title, description, startDate, dueDate, type, status: 'ACTIVE', progress: 0, companyId: ctx.user.companyId },
      include: { keyResults: true },
    });
    return goal;
  }),

  updateGoalProgress: protectedProcedure.input(updateGoalProgressSchema).mutation(async ({ ctx, input }) => {
    const { goalId, progress } = input;
    const goal = await ctx.db.goal.findUnique({ where: { id: goalId }, include: { employee: true } });
    if (!goal) throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
    if (goal.employee && goal.employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    const updated = await ctx.db.goal.update({
      where: { id: goalId },
      data: { progress, status: progress >= 100 ? 'COMPLETED' : 'ACTIVE' },
    });
    return updated;
  }),

  // Update key result current value
  updateKeyResult: protectedProcedure
    .input(z.object({ keyResultId: z.string(), currentValue: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const kr = await ctx.db.keyResult.findUnique({ where: { id: input.keyResultId }, include: { goal: { include: { employee: true } } } });
      if (!kr) throw new TRPCError({ code: 'NOT_FOUND' });
      if (kr.goal.employee && kr.goal.employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN' });
      const updated = await ctx.db.keyResult.update({
        where: { id: input.keyResultId },
        data: { currentValue: input.currentValue },
      });
      // Auto-update goal progress based on key results
      const allKrs = await ctx.db.keyResult.findMany({ where: { goalId: kr.goalId } });
      if (allKrs.length > 0) {
        const avgProgress = Math.round(allKrs.reduce((sum: number, k: any) => {
          const id_match = k.id === input.keyResultId;
          const val = id_match ? input.currentValue : k.currentValue;
          return sum + Math.min((val / k.targetValue) * 100, 100);
        }, 0) / allKrs.length);
        await ctx.db.goal.update({
          where: { id: kr.goalId },
          data: { progress: avgProgress, status: avgProgress >= 100 ? 'COMPLETED' : 'ACTIVE' },
        });
      }
      return updated;
    }),

  // Add key result to a goal
  addKeyResult: protectedProcedure
    .input(z.object({ goalId: z.string(), title: z.string().min(1), targetValue: z.number(), unit: z.string().default('units') }))
    .mutation(async ({ ctx, input }) => {
      const goal = await ctx.db.goal.findUnique({ where: { id: input.goalId }, include: { employee: true } });
      if (!goal) throw new TRPCError({ code: 'NOT_FOUND' });
      if (goal.employee && goal.employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN' });
      return ctx.db.keyResult.create({
        data: { goalId: input.goalId, title: input.title, targetValue: input.targetValue, currentValue: 0, unit: input.unit },
      });
    }),

  // List reviews for a cycle
  listReviews: protectedProcedure
    .input(z.object({ cycleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.performanceReview.findMany({
        where: { cycleId: input.cycleId },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, avatar: true, department: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Company-wide goals (no employeeId filter)
  listAllGoals: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.goal.findMany({
      where: { companyId: ctx.user.companyId },
      include: {
        keyResults: true,
        employee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),
});
