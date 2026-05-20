import { initTRPC, TRPCError } from '@trpc/server';
import { type Session } from 'next-auth';
import { prisma } from '@/lib/db';

export type Context = { session: Session | null; db: typeof prisma; };
const t = initTRPC.context<Context>().create();
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
});
const noOperatorSalary = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (ctx.session.user.role === 'OPERATOR') throw new TRPCError({ code: 'FORBIDDEN', message: 'Operators cannot access salary data' });
  return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
});
const requireHrAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const role = ctx.session.user.role;
  if (!['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'HR/Admin access required' });
  }
  return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
});
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const hrProtectedProcedure = t.procedure.use(isAuthed).use(requireHrAdmin);
export const salaryProtectedProcedure = t.procedure.use(isAuthed).use(noOperatorSalary);
