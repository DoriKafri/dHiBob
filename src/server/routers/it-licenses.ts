import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const CATEGORIES = ['Identity', 'Communication', 'AI', 'Development', 'Security', 'General', 'Other'] as const;
const LICENSE_TYPES = ['Monthly', 'Yearly', 'Perpetual'] as const;
const STATUSES = ['Active', 'Inactive', 'Expired'] as const;

function requireIt(role: string) {
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'IT'].includes(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'IT/Admin only' });
  }
}

export const itLicensesRouter = router({
  // List all licenses with assignment counts
  list: protectedProcedure.query(async ({ ctx }) => {
    requireIt(ctx.user.role);
    return ctx.db.iTLicense.findMany({
      where: { companyId: ctx.user.companyId },
      include: {
        _count: { select: { assignments: true } },
        assignments: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true, department: { select: { name: true } } } },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
      orderBy: { item: 'asc' },
    });
  }),

  create: protectedProcedure
    .input(z.object({
      item: z.string().min(1),
      publisher: z.string().optional(),
      planName: z.string().optional(),
      category: z.enum(CATEGORIES).default('General'),
      licenseType: z.enum(LICENSE_TYPES).default('Monthly'),
      renewalDate: z.coerce.date().optional(),
      status: z.enum(STATUSES).default('Active'),
      totalSeats: z.number().int().default(0),
      pricePerSeat: z.number().default(0),
      currency: z.string().default('USD'),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTLicense.create({
        data: { companyId: ctx.user.companyId, ...input },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      item: z.string().optional(),
      publisher: z.string().nullable().optional(),
      planName: z.string().nullable().optional(),
      category: z.enum(CATEGORIES).optional(),
      licenseType: z.enum(LICENSE_TYPES).optional(),
      renewalDate: z.coerce.date().nullable().optional(),
      status: z.enum(STATUSES).optional(),
      totalSeats: z.number().int().optional(),
      pricePerSeat: z.number().optional(),
      currency: z.string().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      const { id, ...data } = input;
      return ctx.db.iTLicense.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTLicense.delete({ where: { id: input.id } });
    }),

  // Assign a license to an employee
  assign: protectedProcedure
    .input(z.object({
      licenseId: z.string(),
      employeeId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTLicenseAssignment.create({
        data: input,
      });
    }),

  // Remove a license assignment
  unassign: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTLicenseAssignment.delete({ where: { id: input.id } });
    }),

  // Update assignment status (ASSIGNED ↔ RESERVED)
  updateAssignment: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(['ASSIGNED', 'RESERVED']) }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTLicenseAssignment.update({ where: { id: input.id }, data: { status: input.status } });
    }),

  // Summary stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    requireIt(ctx.user.role);
    const where = { companyId: ctx.user.companyId };
    const licenses = await ctx.db.iTLicense.findMany({
      where,
      include: { _count: { select: { assignments: true } } },
    });
    const totalLicenses = licenses.length;
    const activeLicenses = licenses.filter(l => l.status === 'Active').length;
    const totalSeats = licenses.reduce((s, l) => s + l.totalSeats, 0);
    const usedSeats = licenses.reduce((s, l) => s + l._count.assignments, 0);
    const monthlyCost = licenses
      .filter(l => l.status === 'Active')
      .reduce((s, l) => {
        const monthly = l.licenseType === 'Yearly' ? (l.pricePerSeat * l._count.assignments) / 12 : l.pricePerSeat * l._count.assignments;
        return s + monthly;
      }, 0);
    return { totalLicenses, activeLicenses, totalSeats, usedSeats, monthlyCost: Math.round(monthlyCost * 100) / 100 };
  }),
});
