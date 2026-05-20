import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const lessonSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  type: z.enum(['VIDEO', 'LINK', 'DOCUMENT', 'ARTICLE']),
  url: z.string(),
  duration: z.string().optional(),
});

export const learningRouter = router({
  // List all courses (with enrollment status for current user)
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where: any = { companyId: ctx.user.companyId, status: 'PUBLISHED' };
      if (input?.category) where.category = input.category;
      if (input?.search) {
        where.OR = [
          { title: { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      const courses = await ctx.db.course.findMany({
        where,
        include: {
          creator: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          _count: { select: { enrollments: true } },
          enrollments: {
            where: { employeeId: ctx.user.employeeId },
            select: { id: true, progress: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return courses.map((c: any) => ({
        ...c,
        lessons: JSON.parse(c.lessons || '[]'),
        myEnrollment: c.enrollments[0] || null,
        enrolledCount: c._count.enrollments,
      }));
    }),

  // Get single course with lessons
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          _count: { select: { enrollments: true } },
          enrollments: {
            where: { employeeId: ctx.user.employeeId },
          },
        },
      });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        ...course,
        lessons: JSON.parse(course.lessons || '[]'),
        myEnrollment: (course as any).enrollments[0] || null,
        enrolledCount: (course as any)._count.enrollments,
      };
    }),

  // Create course (any employee)
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().default('General'),
      duration: z.string().optional(),
      lessons: z.array(lessonSchema).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.course.create({
        data: {
          companyId: ctx.user.companyId,
          creatorId: ctx.user.employeeId,
          title: input.title,
          description: input.description,
          category: input.category,
          duration: input.duration,
          lessons: JSON.stringify(input.lessons),
          status: 'PUBLISHED',
        },
      });
    }),

  // Update course
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      duration: z.string().optional(),
      lessons: z.array(lessonSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
      });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND' });
      const { id, lessons, ...rest } = input;
      return ctx.db.course.update({
        where: { id },
        data: { ...rest, ...(lessons ? { lessons: JSON.stringify(lessons) } : {}) },
      });
    }),

  // Delete course
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.id, companyId: ctx.user.companyId },
      });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.course.delete({ where: { id: input.id } });
    }),

  // Enroll in a course
  enroll: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.courseId, companyId: ctx.user.companyId },
      });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.enrollment.create({
        data: { courseId: input.courseId, employeeId: ctx.user.employeeId! },
      });
    }),

  // Complete a lesson
  completeLesson: protectedProcedure
    .input(z.object({ courseId: z.string(), lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const enrollment = await ctx.db.enrollment.findFirst({
        where: { courseId: input.courseId, employeeId: ctx.user.employeeId },
      });
      if (!enrollment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not enrolled' });

      const course = await ctx.db.course.findUnique({ where: { id: input.courseId } });
      if (!course) throw new TRPCError({ code: 'NOT_FOUND' });

      const lessons = JSON.parse(course.lessons || '[]');
      const completed = JSON.parse(enrollment.completedLessons || '[]') as string[];

      if (!completed.includes(input.lessonId)) {
        completed.push(input.lessonId);
      }

      const progress = lessons.length > 0 ? Math.round((completed.length / lessons.length) * 100) : 100;
      const isComplete = progress >= 100;

      return ctx.db.enrollment.update({
        where: { id: enrollment.id },
        data: {
          completedLessons: JSON.stringify(completed),
          progress,
          status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: isComplete ? new Date() : null,
        },
      });
    }),

  // Get categories
  categories: protectedProcedure.query(async ({ ctx }) => {
    const courses = await ctx.db.course.findMany({
      where: { companyId: ctx.user.companyId, status: 'PUBLISHED' },
      select: { category: true },
      distinct: ['category'],
    });
    return courses.map((c: any) => c.category);
  }),
});
