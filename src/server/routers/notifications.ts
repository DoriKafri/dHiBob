import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { NOTIFICATION_EVENT_TYPES } from '@/lib/notification-event-types';
import { notifyService } from '@/lib/notify-service';

// Re-export for backward compatibility with any server-side consumers
export { NOTIFICATION_EVENT_TYPES } from '@/lib/notification-event-types';

const eventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES);

export const notificationsRouter = router({
  // Get notifications for current user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.findMany({
      where: { employeeId: ctx.user.employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }),

  // Unread count
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: { employeeId: ctx.user.employeeId, read: false },
    });
  }),

  // Mark one as read (verifies ownership via employeeId)
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.updateMany({
        where: { id: input.id, employeeId: ctx.user.employeeId },
        data: { read: true },
      });
    }),

  // Mark all as read
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db.notification.updateMany({
      where: { employeeId: ctx.user.employeeId, read: false },
      data: { read: true },
    });
  }),

  // Create notification (restricted to admin/internal use)
  create: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      type: z.string(),
      title: z.string(),
      message: z.string().optional(),
      linkUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can create notifications' });
      }
      // Verify target employee belongs to the same company (multi-tenant isolation)
      const targetEmployee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId },
      });
      if (!targetEmployee) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found or does not belong to your company' });
      }
      return ctx.db.notification.create({
        data: {
          companyId: ctx.user.companyId,
          ...input,
        },
      });
    }),

  // --- Notification Preferences ---

  // Get all preferences for the current user
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const employeeId = ctx.user.employeeId as string;
    return ctx.db.notificationPreference.findMany({
      where: { employeeId },
    });
  }),

  // Upsert a single preference (create or update)
  upsertPreference: protectedProcedure
    .input(z.object({
      eventType: eventTypeSchema,
      inApp: z.boolean(),
      email: z.boolean(),
      slack: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const employeeId = ctx.user.employeeId as string;
      return ctx.db.notificationPreference.upsert({
        where: {
          employeeId_eventType: {
            employeeId,
            eventType: input.eventType,
          },
        },
        create: {
          employeeId,
          eventType: input.eventType,
          inApp: input.inApp,
          email: input.email,
          slack: input.slack,
        },
        update: {
          inApp: input.inApp,
          email: input.email,
          slack: input.slack,
        },
      });
    }),

  // Reset all preferences to defaults (delete all preference rows)
  resetPreferences: protectedProcedure.mutation(async ({ ctx }) => {
    const employeeId = ctx.user.employeeId as string;
    return ctx.db.notificationPreference.deleteMany({
      where: { employeeId },
    });
  }),

  // --- Admin Broadcast Procedures ---

  // Send an HR announcement to all active employees
  sendAnnouncement: protectedProcedure
    .input(z.object({
      title: z.string(),
      message: z.string(),
      linkUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can send announcements' });
      }
      const employees = await ctx.db.employee.findMany({
        where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
        select: { id: true },
      });
      const recipients = employees.map((e: { id: string }) => e.id);
      await notifyService.send({
        companyId: ctx.user.companyId,
        recipients,
        eventType: 'HR_ANNOUNCEMENT',
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl,
      });
    }),

  // Send a system notice to all active employees
  sendSystemNotice: protectedProcedure
    .input(z.object({
      title: z.string(),
      message: z.string(),
      linkUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can send system notices' });
      }
      const employees = await ctx.db.employee.findMany({
        where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
        select: { id: true },
      });
      const recipients = employees.map((e: { id: string }) => e.id);
      await notifyService.send({
        companyId: ctx.user.companyId,
        recipients,
        eventType: 'SYSTEM',
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl,
      });
    }),
});
