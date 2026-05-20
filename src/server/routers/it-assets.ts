import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const TYPES = ['Laptop', 'Monitor', 'Phone', 'Keyboard', 'Mouse', 'Headset', 'Tablet', 'Other'] as const;
const STATUSES = ['Available', 'In Use', 'Repair', 'Retired'] as const;
const WARRANTY = ['Under warranty', 'Out of warranty'] as const;

function requireIt(role: string) {
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'IT'].includes(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'IT/Admin only' });
  }
}

export const itAssetsRouter = router({
  list: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      const where: any = { companyId: ctx.user.companyId };
      if (input?.type) where.type = input.type;
      if (input?.status) where.status = input.status;

      return ctx.db.iTAsset.findMany({
        where,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      item: z.string().min(1),
      serialNumber: z.string().optional(),
      model: z.string().optional(),
      type: z.enum(TYPES).default('Laptop'),
      assigneeId: z.string().nullable().optional(),
      factoryOS: z.string().optional(),
      status: z.enum(STATUSES).default('Available'),
      warrantyStatus: z.enum(WARRANTY).optional(),
      warrantyEndDate: z.coerce.date().optional(),
      cpu: z.string().optional(),
      ram: z.string().optional(),
      storage: z.string().optional(),
      gpu: z.string().optional(),
      notes: z.string().optional(),
      purchaseDate: z.coerce.date().optional(),
      purchaseCost: z.number().optional(),
      currency: z.string().default('ILS'),
      fileKey: z.string().optional(),
      fileName: z.string().optional(),
      fileSize: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTAsset.create({
        data: { companyId: ctx.user.companyId, ...input },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      item: z.string().optional(),
      serialNumber: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      type: z.enum(TYPES).optional(),
      assigneeId: z.string().nullable().optional(),
      factoryOS: z.string().nullable().optional(),
      status: z.enum(STATUSES).optional(),
      warrantyStatus: z.string().nullable().optional(),
      warrantyEndDate: z.coerce.date().nullable().optional(),
      cpu: z.string().nullable().optional(),
      ram: z.string().nullable().optional(),
      storage: z.string().nullable().optional(),
      gpu: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      purchaseDate: z.coerce.date().nullable().optional(),
      purchaseCost: z.number().nullable().optional(),
      currency: z.string().optional(),
      fileKey: z.string().nullable().optional(),
      fileName: z.string().nullable().optional(),
      fileSize: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      const { id, ...data } = input;
      return ctx.db.iTAsset.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTAsset.delete({ where: { id: input.id } });
    }),

  // Get a single asset with all its notes
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      const asset = await ctx.db.iTAsset.findUnique({
        where: { id: input.id },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } },
          assetNotes: {
            include: { author: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND' });
      return asset;
    }),

  addNote: protectedProcedure
    .input(z.object({
      assetId: z.string(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTAssetNote.create({
        data: {
          assetId: input.assetId,
          authorId: ctx.user.employeeId!,
          content: input.content,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      });
    }),

  deleteNote: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireIt(ctx.user.role);
      return ctx.db.iTAssetNote.delete({ where: { id: input.id } });
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    requireIt(ctx.user.role);
    const where = { companyId: ctx.user.companyId };
    const [total, inUse, available, repair] = await Promise.all([
      ctx.db.iTAsset.count({ where }),
      ctx.db.iTAsset.count({ where: { ...where, status: 'In Use' } }),
      ctx.db.iTAsset.count({ where: { ...where, status: 'Available' } }),
      ctx.db.iTAsset.count({ where: { ...where, status: 'Repair' } }),
    ]);
    return { total, inUse, available, repair };
  }),
});
