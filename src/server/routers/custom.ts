import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

export const customRouter = router({
  getDefinitions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.customTableDefinition.findMany({
      where: { companyId: ctx.user.companyId },
    });
  }),

  getRows: protectedProcedure
    .input(z.object({
      employeeId: z.string(),
      tableId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const definition = await ctx.db.customTableDefinition.findUnique({
        where: { id: input.tableId },
      });

      if (!definition || definition.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Table definition not found' });
      }

      const permissions = JSON.parse(definition.permissions);
      const isSelf = ctx.user.employeeId === input.employeeId;
      const isAdminOrHR = ctx.user.role === 'ADMIN' || ctx.user.role === 'HR';

      if (!permissions.employeeView && isSelf && !isAdminOrHR) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to view this table' });
      }

      return ctx.db.customTableRow.findMany({
        where: {
          employeeId: input.employeeId,
          tableDefinitionId: input.tableId,
        },
      });
    }),

  createDefinition: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      columns: z.string(), // JSON string
      permissions: z.string(), // JSON string
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate columns JSON
      try {
        const columns = JSON.parse(input.columns);
        if (!Array.isArray(columns)) throw new Error();
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid columns JSON' });
      }

      // Validate permissions JSON
      try {
        JSON.parse(input.permissions);
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid permissions JSON' });
      }

      return ctx.db.customTableDefinition.create({
        data: {
          companyId: ctx.user.companyId,
          name: input.name,
          description: input.description,
          columns: input.columns,
          permissions: input.permissions,
        },
      });
    }),

  upsertRow: protectedProcedure
    .input(z.object({
      id: z.string().optional(),
      employeeId: z.string(),
      tableId: z.string(),
      data: z.record(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const definition = await ctx.db.customTableDefinition.findUnique({
        where: { id: input.tableId },
      });

      if (!definition || definition.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Table definition not found' });
      }

      // Basic validation based on columns
      const columns = JSON.parse(definition.columns) as Array<{ name: string; type: string }>;
      for (const col of columns) {
        const val = input.data[col.name];
        if (val !== undefined && val !== null) {
          if (col.type === 'NUMBER' && typeof val !== 'number') {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: `Field ${col.name} must be a number` 
            });
          }
        }
      }

      return ctx.db.customTableRow.upsert({
        where: { id: input.id || 'new-id-placeholder' },
        create: {
          employeeId: input.employeeId,
          tableDefinitionId: input.tableId,
          data: JSON.stringify(input.data),
        },
        update: {
          data: JSON.stringify(input.data),
        },
      });
    }),

  deleteRow: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.customTableRow.findUnique({
        where: { id: input.id },
        include: { definition: true },
      });

      if (!row || row.definition.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Row not found' });
      }

      return ctx.db.customTableRow.delete({
        where: { id: input.id },
      });
    }),
});
