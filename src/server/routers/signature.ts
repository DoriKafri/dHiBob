import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { notifyService } from '@/lib/notify-service';
import { stampSignature } from '@/lib/signature-stamper';
import { storage as storageProvider } from '@/lib/storage';
import type { SignaturePlacement } from '@/types/signature';

export const signatureRouter = router({
  /**
   * HR sends a document to an employee for signing.
   * Creates a SignatureRecord with status PENDING and updates Document.signatureStatus.
   */
  requestSignature: protectedProcedure
    .input(
      z.object({
        documentId: z.string(),
        signerId: z.string(),
        placements: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.documentId, companyId: ctx.user.companyId },
      });
      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      const signer = await ctx.db.employee.findFirst({
        where: { id: input.signerId, companyId: ctx.user.companyId },
      });
      if (!signer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Signer employee not found' });
      }

      // Validate placements JSON if provided
      let validatedPlacements: string | undefined;
      if (input.placements) {
        try {
          const parsed = JSON.parse(input.placements);
          if (!Array.isArray(parsed)) throw new Error('Not an array');
          for (const p of parsed) {
            if (typeof p.pageIndex !== 'number' || typeof p.x !== 'number' ||
                typeof p.y !== 'number' || typeof p.width !== 'number' || typeof p.height !== 'number') {
              throw new Error('Invalid placement');
            }
          }
          validatedPlacements = input.placements;
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid placements JSON' });
        }
      }

      const record = await ctx.db.signatureRecord.create({
        data: {
          documentId: doc.id,
          signerId: signer.id,
          signerName: `${signer.firstName} ${signer.lastName}`,
          signerEmail: signer.email,
          status: 'PENDING',
          placements: validatedPlacements ?? null,
          requestedBy: ctx.user.employeeId!,
          companyId: ctx.user.companyId,
        },
      });

      await ctx.db.document.update({
        where: { id: doc.id },
        data: { signatureStatus: 'PENDING_SIGNATURE' },
      });

      // Notify the signer — link to their own profile Work tab
      await notifyService.send({
        companyId: ctx.user.companyId,
        recipients: [signer.id],
        eventType: 'DOCUMENT_PENDING_SIGNATURE',
        title: `Document "${doc.name}" requires your signature`,
        message: 'Please review and sign the document on your profile.',
        linkUrl: `/people/${signer.id}?tab=work`,
      });

      return record;
    }),

  /**
   * Signer submits their signature image.
   * Stamps the PDF, saves the signed copy, updates records.
   */
  sign: protectedProcedure
    .input(
      z.object({
        signatureRecordId: z.string(),
        signatureImageBase64: z.string().max(500_000, 'Signature image exceeds maximum size'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.db.signatureRecord.findFirst({
        where: {
          id: input.signatureRecordId,
          signerId: ctx.user.employeeId!,
          companyId: ctx.user.companyId,
          status: 'PENDING',
        },
        include: { document: true },
      });
      if (!record) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Signature request not found or already processed',
        });
      }

      const now = new Date();

      // Decode the signature image from base64
      const sigMatch = input.signatureImageBase64.match(
        /^data:image\/png;base64,(.+)$/,
      );
      const sigBase64 = sigMatch ? sigMatch[1] : input.signatureImageBase64;
      const signatureImageBytes = Buffer.from(sigBase64, 'base64');

      // Save signature image to storage
      const sigKey = await storageProvider.uploadFile(
        signatureImageBytes,
        `signature-${record.id}.png`,
        'signatures',
      );

      // Parse placements from the record if available
      let placements: SignaturePlacement[] | undefined;
      if (record.placements) {
        try {
          placements = JSON.parse(record.placements);
        } catch {
          // Ignore parse errors for corrupted data — use default position
        }
      }

      // Try to stamp the PDF
      let signedPdfKey: string | null = null;
      if (record.document.filePath) {
        try {
          const pdfBytes = await storageProvider.readFile(record.document.filePath);

          const stampedBytes = await stampSignature(
            new Uint8Array(pdfBytes),
            new Uint8Array(signatureImageBytes),
            {
              signerName: record.signerName,
              signedAt: now,
              ...(placements && placements.length > 0 ? { placements } : {}),
            },
          );

          // Save the signed PDF
          const originalName = record.document.name.replace(/\.pdf$/i, '');
          signedPdfKey = await storageProvider.uploadFile(
            Buffer.from(stampedBytes),
            `${originalName}.signed.pdf`,
            'contracts',
          );
        } catch (err) {
          // Non-blocking: signature is recorded even if PDF stamping fails
          console.error('[signature] PDF stamping failed:', err);
        }
      }

      // Update the signature record
      const updated = await ctx.db.signatureRecord.update({
        where: { id: record.id },
        data: {
          status: 'SIGNED',
          signatureImage: sigKey,
          signedPdfPath: signedPdfKey,
          signedAt: now,
        },
      });

      // Update document status
      await ctx.db.document.update({
        where: { id: record.documentId },
        data: { signatureStatus: 'SIGNED' },
      });

      // Notify the requester — link to the signer's profile
      await notifyService.send({
        companyId: ctx.user.companyId,
        recipients: [record.requestedBy],
        eventType: 'DOCUMENT_SIGNED',
        title: `Document "${record.document.name}" has been signed`,
        message: `${record.signerName} has signed the document.`,
        linkUrl: `/people/${record.signerId}?tab=work`,
      });

      // Notify HR users that a document has been signed
      const hrUsers = await ctx.db.user.findMany({
        where: {
          role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] },
          employee: { companyId: ctx.user.companyId },
        },
        select: { employeeId: true },
      });
      const hrIds = hrUsers.map((u: any) => u.employeeId).filter((id: string | null): id is string => !!id);
      // Exclude the signer (they know they signed) — requester keeps getting notified
      // via the first notification above, but other HR users need to know too
      const hrRecipients = hrIds.filter(id => id !== record.signerId);
      if (hrRecipients.length > 0) {
        await notifyService.send({
          companyId: ctx.user.companyId,
          recipients: hrRecipients,
          eventType: 'DOCUMENT_SIGNED',
          title: `Document "${record.document.name}" has been signed`,
          message: `${record.signerName} has signed the document.`,
          linkUrl: `/people/${record.signerId}?tab=work`,
        });
      }

      return updated;
    }),

  /**
   * Signer declines to sign.
   */
  decline: protectedProcedure
    .input(
      z.object({
        signatureRecordId: z.string(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.db.signatureRecord.findFirst({
        where: {
          id: input.signatureRecordId,
          signerId: ctx.user.employeeId!,
          companyId: ctx.user.companyId,
          status: 'PENDING',
        },
        include: { document: true },
      });
      if (!record) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Signature request not found or already processed',
        });
      }

      const updated = await ctx.db.signatureRecord.update({
        where: { id: record.id },
        data: {
          status: 'DECLINED',
          declinedAt: new Date(),
          declineReason: input.reason || null,
        },
      });

      await ctx.db.document.update({
        where: { id: record.documentId },
        data: { signatureStatus: 'DECLINED' },
      });

      // Notify the requester — link to the signer's profile
      await notifyService.send({
        companyId: ctx.user.companyId,
        recipients: [record.requestedBy],
        eventType: 'DOCUMENT_DECLINED',
        title: `Document "${record.document.name}" was declined`,
        message: `${record.signerName} declined to sign.${input.reason ? ` Reason: ${input.reason}` : ''}`,
        linkUrl: `/people/${record.signerId}?tab=work`,
      });

      return updated;
    }),

  /**
   * Get all pending signature requests for the current user.
   */
  getPending: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.signatureRecord.findMany({
      where: {
        signerId: ctx.user.employeeId!,
        companyId: ctx.user.companyId,
        status: 'PENDING',
      },
      include: {
        document: true,
        requester: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }),

  /**
   * Get all signature records for a given document.
   */
  getByDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.signatureRecord.findMany({
        where: {
          documentId: input.documentId,
          companyId: ctx.user.companyId,
        },
        include: {
          signer: { select: { firstName: true, lastName: true, email: true } },
          requester: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { requestedAt: 'desc' },
      });
    }),

  /**
   * Get download URL for the original PDF of a signature record's document.
   */
  getPdfUrl: protectedProcedure
    .input(z.object({ signatureRecordId: z.string() }))
    .query(async ({ ctx, input }) => {
      const record = await ctx.db.signatureRecord.findFirst({
        where: { id: input.signatureRecordId, companyId: ctx.user.companyId },
        include: { document: true },
      });
      if (!record?.document?.filePath) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }
      const url = await storageProvider.getDownloadUrl(record.document.filePath);
      return { url };
    }),

  /**
   * Get download URL for a signed PDF.
   */
  getSignedPdf: protectedProcedure
    .input(z.object({ signatureRecordId: z.string() }))
    .query(async ({ ctx, input }) => {
      const record = await ctx.db.signatureRecord.findFirst({
        where: {
          id: input.signatureRecordId,
          companyId: ctx.user.companyId,
          status: 'SIGNED',
        },
      });
      if (!record || !record.signedPdfPath) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Signed PDF not found',
        });
      }

      const url = await storageProvider.getDownloadUrl(record.signedPdfPath);
      return { url };
    }),
});
