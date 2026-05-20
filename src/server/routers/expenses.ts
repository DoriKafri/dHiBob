import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { uploadDataUrl, resolveDownloadUrl, isDataUrl } from '@/lib/storage';
import { expensesFolder } from '@/lib/people-folder';

type ExpenseRow = { invoiceFile: string | null; invoiceFileKey: string | null };

async function enrichWithFileUrl<T extends ExpenseRow>(claim: T): Promise<T & { invoiceFileUrl: string | null }> {
  return {
    ...claim,
    invoiceFileUrl: await resolveDownloadUrl(claim.invoiceFileKey, claim.invoiceFile),
  };
}

export const expensesRouter = router({
  // List expenses — employees see their own, admins see all
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
      employeeId: z.string().optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'SUPER_ADMIN' || ctx.user.role === 'ADMIN' || ctx.user.role === 'HR';
      const where: any = { companyId: ctx.user.companyId };

      if (!isAdmin) {
        where.employeeId = ctx.user.employeeId;
      } else if (input?.employeeId) {
        where.employeeId = input.employeeId;
      }

      if (input?.status) where.status = input.status;
      if (input?.startDate || input?.endDate) {
        where.expenseDate = {};
        if (input?.startDate) where.expenseDate.gte = input.startDate;
        if (input?.endDate) where.expenseDate.lte = input.endDate;
      }

      const claims = await ctx.db.expenseClaim.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, avatar: true, department: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return Promise.all(claims.map(enrichWithFileUrl));
    }),

  // Submit expense claim. Accepts a base64 data URL in invoiceFile; the
  // bytes are uploaded to the storage provider and only the key is persisted.
  submit: protectedProcedure
    .input(z.object({
      expenseType: z.string().min(1),
      supplierName: z.string().optional(),
      amount: z.number().positive(),
      currency: z.string().default('USD'),
      expenseDate: z.coerce.date(),
      payrollMonth: z.string().optional(),
      invoiceFile: z.string().optional(),
      invoiceFileName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { invoiceFile, invoiceFileName, ...rest } = input;
      let invoiceFileKey: string | null = null;

      if (isDataUrl(invoiceFile)) {
        const employee = await ctx.db.employee.findUnique({
          where: { id: ctx.user.employeeId! },
          select: { id: true, firstName: true, lastName: true },
        });
        const folder = employee ? expensesFolder(employee) : 'expenses';
        invoiceFileKey = await uploadDataUrl(invoiceFile!, invoiceFileName ?? 'invoice', folder);
      }

      return ctx.db.expenseClaim.create({
        data: {
          companyId: ctx.user.companyId,
          employeeId: ctx.user.employeeId!,
          ...rest,
          invoiceFileName: invoiceFileName ?? null,
          invoiceFileKey,
          // invoiceFile left null — legacy column only holds pre-migration base64
        },
      });
    }),

  // Approve expense (admin/HR only)
  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only HR/Admin can approve expenses' });
      const claim = await ctx.db.expenseClaim.findFirst({ where: { id: input.id, companyId: ctx.user.companyId } });
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.expenseClaim.update({
        where: { id: input.id },
        data: { status: 'APPROVED', reviewedBy: ctx.user.employeeId, reviewedAt: new Date() },
      });
    }),

  // Reject expense (admin/HR only)
  reject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only HR/Admin can reject expenses' });
      const claim = await ctx.db.expenseClaim.findFirst({ where: { id: input.id, companyId: ctx.user.companyId } });
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.expenseClaim.update({
        where: { id: input.id },
        data: { status: 'REJECTED', reviewedBy: ctx.user.employeeId, reviewedAt: new Date() },
      });
    }),

  // Delete expense (own pending only)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.expenseClaim.findFirst({ where: { id: input.id, companyId: ctx.user.companyId } });
      if (!claim) throw new TRPCError({ code: 'NOT_FOUND' });
      if (claim.employeeId !== ctx.user.employeeId && !['SUPER_ADMIN', 'ADMIN', 'HR'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ctx.db.expenseClaim.delete({ where: { id: input.id } });
    }),

  // Summary stats
  summary: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === 'SUPER_ADMIN' || ctx.user.role === 'ADMIN' || ctx.user.role === 'HR';
    const where: any = { companyId: ctx.user.companyId };
    if (!isAdmin) where.employeeId = ctx.user.employeeId;

    const [pending, approved, rejected, all] = await Promise.all([
      ctx.db.expenseClaim.count({ where: { ...where, status: 'PENDING' } }),
      ctx.db.expenseClaim.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { amount: true }, _count: true }),
      ctx.db.expenseClaim.count({ where: { ...where, status: 'REJECTED' } }),
      ctx.db.expenseClaim.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);

    return {
      pending,
      approvedCount: approved._count,
      approvedTotal: approved._sum.amount ?? 0,
      rejected,
      totalCount: all._count,
      totalAmount: all._sum.amount ?? 0,
    };
  }),
});
