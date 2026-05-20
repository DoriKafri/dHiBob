import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { compare, hash } from 'bcryptjs';

export const userRouter = router({
  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const isValid = await compare(input.currentPassword, user.passwordHash);
      if (!isValid) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Current password is incorrect' });

      const newHash = await hash(input.newPassword, 12);
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash: newHash },
      });

      return { success: true };
    }),
});
