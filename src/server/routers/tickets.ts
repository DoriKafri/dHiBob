import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const CATEGORIES = ['General', 'Hardware', 'Software', 'Access', 'Network', 'Other'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const STATUSES   = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

function isItOrAdmin(role: string) {
  return ['SUPER_ADMIN', 'ADMIN', 'IT'].includes(role);
}

export const ticketsRouter = router({
  // List tickets. Employees see their own; IT/Admin sees all.
  list: protectedProcedure
    .input(z.object({
      status: z.enum(STATUSES).optional(),
      category: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where: any = {};
      // Scope: IT/Admin sees all company tickets, employees see only their own
      if (isItOrAdmin(ctx.user.role)) {
        where.creator = { companyId: ctx.user.companyId };
      } else {
        where.creatorId = ctx.user.employeeId;
      }
      if (input?.status) where.status = input.status;
      if (input?.category) where.category = input.category;

      return ctx.db.ticket.findMany({
        where,
        include: {
          creator: { select: { id: true, firstName: true, lastName: true, avatar: true, department: { select: { name: true } } } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Get a single ticket with all comments
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ticket = await ctx.db.ticket.findUnique({
        where: { id: input.id },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true, department: { select: { name: true } } } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          comments: {
            include: {
              author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND' });
      // Employees can only view their own tickets
      if (!isItOrAdmin(ctx.user.role) && ticket.creatorId !== ctx.user.employeeId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ticket;
    }),

  // Create a ticket (any employee)
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(CATEGORIES).default('General'),
      priority: z.enum(PRIORITIES).default('MEDIUM'),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.ticket.create({
        data: {
          companyId: ctx.user.companyId,
          creatorId: ctx.user.employeeId!,
          ...input,
        },
      });
    }),

  // Update ticket status / assignee / priority (IT/Admin only)
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: z.string().nullable().optional(),
      category: z.enum(CATEGORIES).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isItOrAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only IT/Admin can update tickets' });
      }
      const { id, ...data } = input;
      return ctx.db.ticket.update({ where: { id }, data });
    }),

  // Add a comment (any participant — creator or IT/Admin)
  addComment: protectedProcedure
    .input(z.object({
      ticketId: z.string(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await ctx.db.ticket.findUnique({ where: { id: input.ticketId } });
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!isItOrAdmin(ctx.user.role) && ticket.creatorId !== ctx.user.employeeId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ctx.db.ticketComment.create({
        data: {
          ticketId: input.ticketId,
          authorId: ctx.user.employeeId!,
          content: input.content,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      });
    }),

  // Delete a ticket (IT/Admin or creator)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await ctx.db.ticket.findUnique({ where: { id: input.id } });
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!isItOrAdmin(ctx.user.role) && ticket.creatorId !== ctx.user.employeeId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ctx.db.ticket.delete({ where: { id: input.id } });
    }),

  // Stats for the IT dashboard
  stats: protectedProcedure.query(async ({ ctx }) => {
    if (!isItOrAdmin(ctx.user.role)) {
      // Employees see their own stats
      const [open, inProgress, resolved] = await Promise.all([
        ctx.db.ticket.count({ where: { creatorId: ctx.user.employeeId, status: 'OPEN' } }),
        ctx.db.ticket.count({ where: { creatorId: ctx.user.employeeId, status: 'IN_PROGRESS' } }),
        ctx.db.ticket.count({ where: { creatorId: ctx.user.employeeId, status: 'RESOLVED' } }),
      ]);
      return { open, inProgress, resolved, total: open + inProgress + resolved };
    }
    const where = { creator: { companyId: ctx.user.companyId } };
    const [open, inProgress, resolved, total] = await Promise.all([
      ctx.db.ticket.count({ where: { ...where, status: 'OPEN' } }),
      ctx.db.ticket.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      ctx.db.ticket.count({ where: { ...where, status: 'RESOLVED' } }),
      ctx.db.ticket.count({ where }),
    ]);
    return { open, inProgress, resolved, total };
  }),
});
