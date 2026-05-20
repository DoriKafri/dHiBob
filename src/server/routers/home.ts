import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const homeRouter = router({
  createShoutout: protectedProcedure
    .input(z.object({
      content: z.string().min(1),
      targetId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate target employee
      const target = await ctx.db.employee.findUnique({
        where: { id: input.targetId },
        select: { id: true, companyId: true, status: true }
      });

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target employee not found' });
      }

      if (target.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot shoutout employee from different company' });
      }

      if (target.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot shoutout inactive employee' });
      }

      if (!ctx.user.employeeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User must be an employee to post shoutouts' });
      }

      // Create the shoutout post
      return ctx.db.post.create({
        data: {
          type: 'SHOUTOUT',
          content: input.content,
          authorId: ctx.user.employeeId,
          targetId: input.targetId,
          companyId: ctx.user.companyId,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          target: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        }
      });
    }),

  // Who's out today (approved time-off that overlaps with today)
  getTodayAbsences: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const requests = await ctx.db.timeOffRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: tomorrow },
        endDate: { gte: today },
        employee: { companyId: ctx.user.companyId },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, avatar: true, department: { select: { name: true } } } },
        policy: { select: { name: true, color: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    return requests.map(r => ({
      employeeId: r.employee.id,
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      avatar: r.employee.avatar,
      department: r.employee.department?.name || '',
      leaveType: r.policy.name,
      color: r.policy.color,
      startDate: r.startDate,
      endDate: r.endDate,
    }));
  }),

  // Quick stats for the dashboard
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId;
    const employeeId = ctx.user.employeeId;

    const [headcount, pendingTimeOff, myTasks, activeSurveys, openPositions] = await Promise.all([
      ctx.db.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      ctx.db.timeOffRequest.count({ where: { status: 'PENDING', employee: { companyId } } }),
      employeeId ? ctx.db.onboardingTask.count({ where: { assigneeId: employeeId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } }) : 0,
      ctx.db.survey.count({ where: { companyId, status: 'ACTIVE' } }),
      ctx.db.position.count({ where: { companyId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    return { headcount, pendingTimeOff, myTasks, activeSurveys, openPositions };
  }),

  // Upcoming events (birthdays, anniversaries, holidays in next 14 days)
  getUpcomingEvents: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    const twoWeeksOut = new Date();
    twoWeeksOut.setDate(today.getDate() + 14);

    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, avatar: true, startDate: true, personalInfo: true },
    });

    const events: Array<{ type: string; date: Date; name: string; detail: string; avatar?: string | null }> = [];

    for (const emp of employees) {
      // Anniversaries in next 14 days
      const start = new Date(emp.startDate);
      if (start.getFullYear() < today.getFullYear()) {
        const annivThisYear = new Date(today.getFullYear(), start.getMonth(), start.getDate());
        if (annivThisYear >= today && annivThisYear <= twoWeeksOut) {
          const years = today.getFullYear() - start.getFullYear();
          events.push({ type: 'ANNIVERSARY', date: annivThisYear, name: `${emp.firstName} ${emp.lastName}`, detail: `${years} year${years > 1 ? 's' : ''}`, avatar: emp.avatar });
        }
      }

      // Birthdays in next 14 days
      try {
        const info = JSON.parse(emp.personalInfo || '{}');
        const dob = info.dateOfBirth || info.birthday;
        if (dob) {
          const bday = new Date(dob);
          const bdayThisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
          if (bdayThisYear >= today && bdayThisYear <= twoWeeksOut) {
            events.push({ type: 'BIRTHDAY', date: bdayThisYear, name: `${emp.firstName} ${emp.lastName}`, detail: 'Birthday', avatar: emp.avatar });
          }
        }
      } catch {}
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }),

  getFeed: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const nextSevenDays = new Date();
    nextSevenDays.setDate(today.getDate() + 7);

    // Fetch data concurrently
    const [employees, posts, hrItems] = await Promise.all([
      ctx.db.employee.findMany({
        where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          startDate: true,
          personalInfo: true,
          department: { select: { name: true } }
        },
      }),
      ctx.db.post.findMany({
        where: { companyId: ctx.user.companyId },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          target: { select: { id: true, firstName: true, lastName: true, avatar: true } }
        },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.db.hrPortalItem.findMany({
        where: { companyId: ctx.user.companyId },
        include: { author: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const feed: any[] = [];

    // New Joiners (last 7 days — shown on the Welcome screen for one week after start date)
    employees.filter(e => e.startDate >= sevenDaysAgo && e.startDate <= today).forEach(e => {
      feed.push({ 
        type: 'NEW_JOINER', 
        date: e.startDate, 
        data: { id: e.id, firstName: e.firstName, lastName: e.lastName, avatar: e.avatar, department: e.department } 
      });
    });

    // Birthdays & Anniversaries
    employees.forEach(e => {
      const start = new Date(e.startDate);
      // Anniversary
      if (start.getMonth() === today.getMonth() && start.getDate() === today.getDate() && start.getFullYear() < today.getFullYear()) {
        feed.push({ 
          type: 'ANNIVERSARY', 
          date: new Date(today.getFullYear(), start.getMonth(), start.getDate()), 
          data: { id: e.id, firstName: e.firstName, lastName: e.lastName, avatar: e.avatar, years: today.getFullYear() - start.getFullYear() } 
        });
      }

      // Birthday
      try {
        const info = JSON.parse(e.personalInfo || '{}');
        if (info.birthday) {
          const bday = new Date(info.birthday);
          const bdayThisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
          if (bdayThisYear >= today && bdayThisYear <= nextSevenDays) {
            feed.push({ 
              type: 'BIRTHDAY', 
              date: bdayThisYear, 
              data: { id: e.id, firstName: e.firstName, lastName: e.lastName, avatar: e.avatar } 
            });
          }
        }
      } catch (err) { /* ignore */ }
    });

    // HR Announcements from HR Portal (shoutouts removed per feedback)
    hrItems.forEach((item: any) => {
      feed.push({
        type: 'HR_ANNOUNCEMENT',
        date: item.createdAt,
        data: {
          id: item.id,
          title: item.title,
          content: item.content,
          itemType: item.type,
          section: item.section,
          url: item.url,
          author: item.author,
        },
      });
    });

    // Sort by date descending
    return feed.sort((a, b) => b.date.getTime() - a.date.getTime());
  }),
});
