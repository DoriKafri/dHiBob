import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

const submitRequestSchema = z.object({
  employeeId: z.string(),
  type: z.enum(['VACATION', 'SICK', 'PERSONAL', 'UNPAID']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

const listRequestsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  employeeId: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  cursor: z.string().optional(),
});

const approveRejectSchema = z.object({ requestId: z.string(), notes: z.string().optional() });
const getBalanceSchema = z.object({ employeeId: z.string(), year: z.number().optional() });

export const timeoffRouter = router({
  listRequests: protectedProcedure.input(listRequestsSchema).query(async ({ ctx, input }) => {
    const { status, employeeId, limit, cursor } = input;
    let where: any = { employee: { companyId: ctx.user.companyId } };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    const requests = await ctx.db.timeOffRequest.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    let nextCursor: typeof cursor | undefined = undefined;
    if (requests.length > limit) { const nextItem = requests.pop(); nextCursor = nextItem?.id; }
    return { requests, nextCursor };
  }),

  submitRequest: protectedProcedure.input(submitRequestSchema).mutation(async ({ ctx, input }) => {
    const { employeeId, type, startDate, endDate, reason } = input;
    const employee = await ctx.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this employee' });
    if (startDate >= endDate) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start date must be before end date' });
    const request = await ctx.db.timeOffRequest.create({
      data: { employeeId, type, startDate, endDate, reason, status: 'PENDING', requestedDate: new Date() },
      include: { employee: true },
    });
    return request;
  }),

  approve: protectedProcedure.input(approveRejectSchema).mutation(async ({ ctx, input }) => {
    const request = await ctx.db.timeOffRequest.findUnique({ where: { id: input.requestId }, include: { employee: true } });
    if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
    if (request.employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this request' });
    const approved = await ctx.db.timeOffRequest.update({
      where: { id: input.requestId },
      data: { status: 'APPROVED', approverId: ctx.user.employeeId, approvedDate: new Date(), notes: input.notes },
      include: { employee: true, approver: true },
    });
    return approved;
  }),

  reject: protectedProcedure.input(approveRejectSchema).mutation(async ({ ctx, input }) => {
    const request = await ctx.db.timeOffRequest.findUnique({ where: { id: input.requestId }, include: { employee: true } });
    if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
    if (request.employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this request' });
    const rejected = await ctx.db.timeOffRequest.update({
      where: { id: input.requestId },
      data: { status: 'REJECTED', approverId: ctx.user.employeeId, approvedDate: new Date(), notes: input.notes },
      include: { employee: true, approver: true },
    });
    return rejected;
  }),

  getBalance: protectedProcedure.input(getBalanceSchema).query(async ({ ctx, input }) => {
    const { employeeId, year } = input;
    const currentYear = year || new Date().getFullYear();
    const employee = await ctx.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this employee' });
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    const approvedRequests = await ctx.db.timeOffRequest.findMany({
      where: { employeeId, status: 'APPROVED', startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
    });
    const allocationByType = { VACATION: 20, SICK: 10, PERSONAL: 3, UNPAID: Infinity };
    return {
      employeeId, year: currentYear,
      vacation: { allocated: allocationByType.VACATION, used: approvedRequests.filter(r => r.type === 'VACATION').length, remaining: allocationByType.VACATION - (approvedRequests.filter(r => r.type === 'VACATION').length || 0) },
      sick: { allocated: allocationByType.SICK, used: approvedRequests.filter(r => r.type === 'SICK').length, remaining: allocationByType.SICK - (approvedRequests.filter(r => r.type === 'SICK').length || 0) },
      personal: { allocated: allocationByType.PERSONAL, used: approvedRequests.filter(r => r.type === 'PERSONAL').length, remaining: allocationByType.PERSONAL - (approvedRequests.filter(r => r.type === 'PERSONAL').length || 0) },
    };
  }),
});
