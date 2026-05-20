import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { notifyService } from '@/lib/notify-service';

const questionSchema = z.object({
  id: z.string(),
  type: z.enum(['MULTIPLE_CHOICE', 'CHECKBOX', 'SHORT_TEXT', 'LONG_TEXT', 'RATING']),
  title: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(), // For MULTIPLE_CHOICE and CHECKBOX
  maxRating: z.number().optional(), // For RATING (default 5)
});

export const surveysRouter = router({
  // List all surveys for the company
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.survey.findMany({
      where: { companyId: ctx.user.companyId },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),

  // Get single survey with questions
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          _count: { select: { responses: true } },
        },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        ...survey,
        questions: JSON.parse(survey.questions || '[]'),
      };
    }),

  // Create a new survey
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      anonymous: z.boolean().default(true),
      questions: z.array(questionSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.survey.create({
        data: {
          companyId: ctx.user.companyId,
          creatorId: ctx.user.employeeId,
          title: input.title,
          description: input.description,
          anonymous: input.anonymous,
          questions: JSON.stringify(input.questions),
          status: 'DRAFT',
        },
      });
    }),

  // Update survey (only if DRAFT)
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      anonymous: z.boolean().optional(),
      questions: z.array(questionSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, questions, ...rest } = input;
      return ctx.db.survey.update({
        where: { id },
        data: {
          ...rest,
          ...(questions ? { questions: JSON.stringify(questions) } : {}),
        },
      });
    }),

  // Publish survey (DRAFT -> ACTIVE)
  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND' });
      const published = await ctx.db.survey.update({
        where: { id: input.id },
        data: { status: 'ACTIVE' },
      });

      // Notify all active employees in the company about the new survey
      const activeEmployees = await ctx.db.employee.findMany({
        where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
        select: { id: true },
      });
      const recipientIds = activeEmployees.map((e: { id: string }) => e.id);
      if (recipientIds.length > 0) {
        await notifyService.send({
          companyId: ctx.user.companyId,
          recipients: recipientIds,
          eventType: 'SURVEY_PUBLISHED',
          title: `New survey: ${survey.title}`,
          message: survey.description || 'A new survey is available for you to complete.',
          linkUrl: '/surveys',
        });
      }

      return published;
    }),

  // Close survey (ACTIVE -> COMPLETED)
  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.survey.update({
        where: { id: input.id },
        data: { status: 'COMPLETED' },
      });
    }),

  // Delete survey
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.survey.delete({ where: { id: input.id } });
    }),

  // Submit response to a survey
  submitResponse: protectedProcedure
    .input(z.object({
      surveyId: z.string(),
      answers: z.record(z.string(), z.any()), // { questionId: answer }
    }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.surveyId, companyId: ctx.user.companyId, status: 'ACTIVE' },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND', message: 'Survey not found or not active' });

      // Check if already responded
      const existing = await ctx.db.surveyResponse.findFirst({
        where: { surveyId: input.surveyId, employeeId: ctx.user.employeeId },
      });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'You have already responded to this survey' });

      return ctx.db.surveyResponse.create({
        data: {
          surveyId: input.surveyId,
          employeeId: survey.anonymous ? null : ctx.user.employeeId,
          answers: JSON.stringify(input.answers),
          submittedAt: new Date(),
        },
      });
    }),

  // Check if current user has responded
  hasResponded: protectedProcedure
    .input(z.object({ surveyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await ctx.db.surveyResponse.findFirst({
        where: { surveyId: input.surveyId, employeeId: ctx.user.employeeId },
      });
      return !!response;
    }),

  // Get survey results (for survey creator or HR)
  getResults: protectedProcedure
    .input(z.object({ surveyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findFirst({
        where: { id: input.surveyId, companyId: ctx.user.companyId },
      });
      if (!survey) throw new TRPCError({ code: 'NOT_FOUND' });
      const isAdminRole = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(ctx.user.role);
      const isCreator = (survey as any).createdBy === ctx.user.employeeId;
      if (!isAdminRole && !isCreator) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only HR or the survey creator can view results' });

      const responses = await ctx.db.surveyResponse.findMany({
        where: { surveyId: input.surveyId },
        include: survey.anonymous ? undefined : {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      const questions = JSON.parse(survey.questions || '[]');
      const parsedResponses = responses.map((r: any) => ({
        ...r,
        answers: JSON.parse(r.answers || '{}'),
      }));

      return { survey: { ...survey, questions }, responses: parsedResponses, totalResponses: responses.length };
    }),
});
