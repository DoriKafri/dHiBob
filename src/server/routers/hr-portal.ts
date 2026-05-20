import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { uploadDataUrl, resolveDownloadUrl, isDataUrl } from '@/lib/storage';

function requireHr(role: string) {
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN' && role !== 'HR') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only HR/Admin can edit the portal' });
  }
}

const itemSchema = z.object({
  type: z.enum(['LINK', 'ANNOUNCEMENT', 'FILE']),
  section: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
  url: z.string().optional(),
  fileName: z.string().optional(),
  fileData: z.string().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

type PortalRow = { fileData: string | null; fileKey: string | null };

async function enrichWithFileUrl<T extends PortalRow>(item: T): Promise<T & { fileUrl: string | null }> {
  return {
    ...item,
    fileUrl: await resolveDownloadUrl(item.fileKey, item.fileData),
  };
}

export const hrPortalRouter = router({
  // All employees can view
  list: protectedProcedure.query(async ({ ctx }) => {
    const items = await ctx.db.hrPortalItem.findMany({
      where: { companyId: ctx.user.companyId },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: [{ pinned: 'desc' }, { section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const enriched = await Promise.all(items.map(enrichWithFileUrl));

    // Group by section
    const sectionMap = new Map<string, typeof enriched>();
    for (const item of enriched) {
      if (!sectionMap.has(item.section)) sectionMap.set(item.section, []);
      sectionMap.get(item.section)!.push(item);
    }
    return Array.from(sectionMap.entries()).map(([section, items]) => ({ section, items }));
  }),

  // HR/Admin only — create. A base64 data URL in fileData is uploaded to
  // the storage provider; only the key is persisted.
  create: protectedProcedure
    .input(itemSchema)
    .mutation(async ({ ctx, input }) => {
      requireHr(ctx.user.role);
      let fileKey: string | null = null;
      if (isDataUrl(input.fileData)) {
        fileKey = await uploadDataUrl(input.fileData!, input.fileName ?? 'file', 'hr_portal');
      }

      return ctx.db.hrPortalItem.create({
        data: {
          companyId: ctx.user.companyId,
          authorId: ctx.user.employeeId!,
          type: input.type,
          section: input.section,
          title: input.title,
          content: input.content,
          url: input.url,
          fileName: input.fileName,
          fileKey,
          // fileData left null — legacy column only holds pre-migration base64
          pinned: input.pinned ?? false,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    }),

  // HR/Admin only — update
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(itemSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      requireHr(ctx.user.role);
      const item = await ctx.db.hrPortalItem.findUnique({ where: { id: input.id } });
      if (!item || item.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      const { id, fileData, ...rest } = input;
      const data: any = { ...rest };
      if (fileData !== undefined) {
        if (isDataUrl(fileData)) {
          data.fileKey = await uploadDataUrl(fileData, input.fileName ?? item.fileName ?? 'file', 'hr_portal');
          data.fileData = null;
        } else if (fileData === '') {
          // explicit clear
          data.fileKey = null;
          data.fileData = null;
        }
      }
      return ctx.db.hrPortalItem.update({ where: { id }, data });
    }),

  // HR/Admin only — delete
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireHr(ctx.user.role);
      const item = await ctx.db.hrPortalItem.findUnique({ where: { id: input.id } });
      if (!item || item.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      return ctx.db.hrPortalItem.delete({ where: { id: input.id } });
    }),
});
