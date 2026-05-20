import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { notifyService } from '@/lib/notify-service';

export const documentRouter = router({
  list: protectedProcedure
    .input(z.object({
      employeeId: z.string().optional(),
      folder: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const isAdminRole = ['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATOR'].includes(ctx.user.role);
      // Employees can only see their own documents
      if (input.employeeId && input.employeeId !== ctx.user.employeeId && !isAdminRole) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only view your own documents' });
      }
      return ctx.db.document.findMany({
        where: {
          companyId: ctx.user.companyId,
          ...(input.employeeId && { employeeId: input.employeeId }),
          ...(!input.employeeId && !isAdminRole && { employeeId: ctx.user.employeeId }),
          ...(input.folder && { folder: input.folder }),
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  createForSignature: protectedProcedure
    .input(z.object({
      name: z.string(),
      filePath: z.string(),
      employeeId: z.string(),
      type: z.string().default('CONTRACT'),
      folder: z.string().default('contracts'),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.document.create({
        data: {
          name: input.name,
          filePath: input.filePath,
          employeeId: input.employeeId,
          type: input.type,
          folder: input.folder,
          companyId: ctx.user.companyId,
          uploadedBy: ctx.user.employeeId || ctx.user.id,
          fileSize: 0,
          mimeType: 'application/pdf',
        },
      });
    }),

  getDocumentPdfUrl: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.documentId, companyId: ctx.user.companyId },
      });
      if (!doc?.filePath) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }
      const { storage } = await import('@/lib/storage');
      const url = await storage.getDownloadUrl(doc.filePath);
      return { url };
    }),

  sign: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.update({
        where: { id: input.id, companyId: ctx.user.companyId },
        data: { signatureStatus: 'SIGNED' },
      });

      // Notify the document owner that their document was signed
      if (doc.employeeId && doc.employeeId !== ctx.user.employeeId) {
        await notifyService.send({
          companyId: ctx.user.companyId,
          recipients: [doc.employeeId],
          eventType: 'DOCUMENT_SIGNED',
          title: `Document "${doc.name}" has been signed`,
          message: 'Your document has been signed successfully.',
          linkUrl: `/people/${doc.employeeId}`,
        });
      }

      return doc;
    }),
});
