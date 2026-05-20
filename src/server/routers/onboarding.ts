import { z } from 'zod';
import { router, protectedProcedure, hrProtectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { notifyService } from '@/lib/notify-service';

const taskStatusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']);

// Default onboarding checklist template
const DEFAULT_ONBOARDING_TASKS = [
  // Pre-boarding
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Approving recruitment', sortOrder: 1 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Notifying Candidate & HR', sortOrder: 2 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Contact Candidate for onboarding', sortOrder: 3 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Is computer needed?', sortOrder: 4 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Choosing Team Lead', sortOrder: 5 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Scheduling Kick Off (Internal)', sortOrder: 6 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Sending work start invite (on-site / remote)', sortOrder: 7 },
  { section: 'Pre-boarding', sectionType: 'GENERAL', title: 'Updating candidate & client info', sortOrder: 8 },
  // Contract & Systems
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Contract', sortOrder: 1 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Buddy', sortOrder: 2 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Sending the employee a "welcome aboard" mail', sortOrder: 3 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Michpal - 101 form', sortOrder: 4 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Academy ocean', sortOrder: 5 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'DreamTeam', sortOrder: 6 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'BuyMe', sortOrder: 7 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Accountant', sortOrder: 8 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Insurance', sortOrder: 9 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Zone (Hitechzone)', sortOrder: 10 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Uploading salary plan on DreamTeam', sortOrder: 11 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Cover', sortOrder: 12 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Add to birthday calendar', sortOrder: 13 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Add to "contact us" sheet + Notion', sortOrder: 14 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Add to delivery sheet', sortOrder: 15 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Toggl', sortOrder: 16 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Slack', sortOrder: 17 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Mindspace card', sortOrder: 18 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Changing WS account', sortOrder: 19 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Add to delivery group', sortOrder: 20 },
  { section: 'Contract & Systems', sectionType: 'GENERAL', title: 'Welcome gift', sortOrder: 21 },
  // Upcoming meetings
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a Welcome meeting with TL', sortOrder: 1 },
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a Welcome meeting with Head of delivery', sortOrder: 2 },
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a Welcome meeting with manager', sortOrder: 3 },
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR', sortOrder: 4 },
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR - 1 week later', sortOrder: 5 },
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR - 1 month later', sortOrder: 6 },
  { section: 'Upcoming meetings', sectionType: 'GENERAL', title: 'Scheduling a meeting with HR - 3 months later', sortOrder: 7 },
  // DevOps-specific
  { section: 'DevOps', sectionType: 'DEVOPS', title: 'AWS / Cloud access setup', sortOrder: 1 },
  { section: 'DevOps', sectionType: 'DEVOPS', title: 'CI/CD pipeline access', sortOrder: 2 },
  { section: 'DevOps', sectionType: 'DEVOPS', title: 'VPN & SSH key configuration', sortOrder: 3 },
  { section: 'DevOps', sectionType: 'DEVOPS', title: 'Monitoring dashboards access (Grafana/Datadog)', sortOrder: 4 },
  { section: 'DevOps', sectionType: 'DEVOPS', title: 'On-call rotation introduction', sortOrder: 5 },
];

// Default offboarding checklist template
const DEFAULT_OFFBOARDING_TASKS = [
  // Administrative
  { section: 'Administrative', title: 'Was the employee fired or resigned?', sortOrder: 1 },
  { section: 'Administrative', title: 'Employment termination letter', sortOrder: 2 },
  { section: 'Administrative', title: 'Update manager on employment end', sortOrder: 3 },
  { section: 'Administrative', title: 'Approve employment period', sortOrder: 4 },
  { section: 'Administrative', title: 'Send pension release documents', sortOrder: 5 },
  { section: 'Administrative', title: 'Final account settlement', sortOrder: 6 },
  // Systems & Access
  { section: 'Systems & Access', title: 'Cancel BuyMe and remove from birthday calendar', sortOrder: 1 },
  { section: 'Systems & Access', title: 'Cancel Zone/Cibus', sortOrder: 2 },
  { section: 'Systems & Access', title: 'Update employment end in DreamTeam', sortOrder: 3 },
  { section: 'Systems & Access', title: 'Update employer portal', sortOrder: 4 },
  { section: 'Systems & Access', title: 'Return equipment to office', sortOrder: 5 },
  { section: 'Systems & Access', title: 'Cancel Cover', sortOrder: 6 },
  { section: 'Systems & Access', title: 'Remove from Slack/Teams', sortOrder: 7 },
  { section: 'Systems & Access', title: 'Revoke VPN & system access', sortOrder: 8 },
  { section: 'Systems & Access', title: 'Transfer data ownership', sortOrder: 9 },
  // HR & Finance
  { section: 'HR & Finance', title: 'HR conversation', sortOrder: 1 },
  { section: 'HR & Finance', title: 'Check if there is a loan and handle', sortOrder: 2 },
  { section: 'HR & Finance', title: 'Update health insurance about departure', sortOrder: 3 },
  { section: 'HR & Finance', title: 'Check if employee has VESTED shares', sortOrder: 4 },
  { section: 'HR & Finance', title: 'Execute share purchase in payslip', sortOrder: 5 },
];

export const onboardingRouter = router({
  // NOTE: status filter updated from 'PENDING' to match new status values (NOT_STARTED/IN_PROGRESS/DONE)
  myTasks: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.onboardingTask.findMany({
      where: { assigneeId: ctx.user.id, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
    });
  }),

  createTask: hrProtectedProcedure
    .input(z.object({
      employeeId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      // assigneeType removed — field no longer exists on OnboardingTask schema
      assigneeId: z.string().optional(),
      dueDate: z.coerce.date().optional(),
      section: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Employee not found or does not belong to your company',
        });
      }
      const task = await ctx.db.onboardingTask.create({
        data: {
          employeeId: input.employeeId,
          title: input.title,
          description: input.description,
          assigneeId: input.assigneeId,
          dueDate: input.dueDate,
          section: input.section ?? 'General',
          sectionType: 'GENERAL',
          status: 'NOT_STARTED',
        },
      });

      // Notify the assignee about the new task
      if (input.assigneeId && input.assigneeId !== ctx.user.employeeId) {
        await notifyService.send({
          companyId: ctx.user.companyId,
          recipients: [input.assigneeId],
          eventType: 'TASK_ASSIGNED',
          title: `New task assigned: ${input.title}`,
          message: `You have been assigned a new onboarding task for ${employee.firstName} ${employee.lastName}.`,
          linkUrl: '/lifecycle/onboarding',
        });
      }

      return task;
    }),

  start: protectedProcedure
    .input(z.object({ employeeId: z.string(), templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found or does not belong to your company' });

      const template = await ctx.db.onboardingTemplate.findFirst({
        where: { id: input.templateId, companyId: ctx.user.companyId }
      });
      if (!template) throw new TRPCError({ code: 'NOT_FOUND' });

      let taskTitles: string[];
      try {
        taskTitles = JSON.parse(template.tasks) as string[];
        if (!Array.isArray(taskTitles)) throw new Error('Tasks must be an array');
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to parse template tasks' });
      }

      return ctx.db.onboardingTask.createMany({
        data: taskTitles.map((title, i) => ({
          employeeId: input.employeeId,
          templateId: input.templateId,
          title,
          section: 'General',
          sectionType: 'GENERAL',
          status: 'NOT_STARTED',
          sortOrder: i,
        }))
      });
    }),

  // Add a new hire — creates employee with PENDING_HIRE status and starts onboarding
  addNewHire: hrProtectedProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      departmentId: z.string().optional(),
      startDate: z.coerce.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create employee with PENDING_HIRE status (not yet in People)
      const employee = await ctx.db.employee.create({
        data: {
          companyId: ctx.user.companyId,
          firstName: input.firstName,
          lastName: input.lastName,
          displayName: `${input.firstName} ${input.lastName}`,
          email: input.email,
          status: 'PENDING_HIRE',
          employmentType: 'FULL_TIME',
          startDate: input.startDate,
          departmentId: input.departmentId || undefined,
          personalInfo: JSON.stringify({}),
          workInfo: JSON.stringify({}),
        },
        include: { department: { select: { name: true } } },
      });

      // Auto-detect DevOps and create onboarding tasks
      const isDevOps = (employee as any).department?.name?.toLowerCase().includes('engineering') ?? false;
      const tasks = DEFAULT_ONBOARDING_TASKS.filter(t => isDevOps || t.sectionType !== 'DEVOPS');
      await ctx.db.onboardingTask.createMany({
        data: tasks.map(t => ({
          employeeId: employee.id,
          title: t.title,
          section: t.section,
          sectionType: t.sectionType,
          status: 'NOT_STARTED' as const,
          sortOrder: t.sortOrder,
        })),
        skipDuplicates: true,
      });

      return employee;
    }),

  // Convert pending hire to active employee (called when Contract task is done)
  activateHire: hrProtectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId },
      });
      if (!employee) throw new TRPCError({ code: 'NOT_FOUND' });

      // Create a user account for the new employee
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('password123', 10);
      await ctx.db.user.create({
        data: { email: employee.email, passwordHash, role: 'EMPLOYEE', employeeId: employee.id },
      }).catch(() => {}); // Ignore if user already exists

      return ctx.db.employee.update({
        where: { id: input.employeeId },
        data: { status: 'ACTIVE' },
      });
    }),

  createOffboardingTask: hrProtectedProcedure
    .input(z.object({
      employeeId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      assigneeId: z.string().optional(),
      dueDate: z.coerce.date().optional(),
      section: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found or does not belong to your company' });
      }
      return ctx.db.offboardingTask.create({
        data: {
          employeeId: input.employeeId,
          title: input.title,
          assigneeId: input.assigneeId,
          dueDate: input.dueDate,
          section: input.section ?? 'General',
          status: 'NOT_STARTED',
        },
      });
    }),

  // Start onboarding with default tasks
  startOnboarding: hrProtectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId },
        include: { department: { select: { name: true } } },
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      const isDevOps = employee.department?.name?.toLowerCase().includes('engineering') ?? false;
      const tasks = DEFAULT_ONBOARDING_TASKS.filter(t => isDevOps || t.sectionType !== 'DEVOPS');

      return ctx.db.onboardingTask.createMany({
        data: tasks.map(t => ({
          employeeId: input.employeeId,
          title: t.title,
          section: t.section,
          sectionType: t.sectionType,
          status: 'NOT_STARTED' as const,
          sortOrder: t.sortOrder,
        })),
        skipDuplicates: true,
      });
    }),

  listNewHires: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: { in: ['ACTIVE', 'PENDING_HIRE'] } },
      include: {
        onboardingTasks: {
          orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
          include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }),

  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.onboardingTemplate.findMany({ where: { companyId: ctx.user.companyId } });
  }),

  // NEW: Get checklist grouped by section for a specific employee
  getChecklist: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      const tasks = await ctx.db.onboardingTask.findMany({
        where: { employeeId: input.employeeId },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });

      // Group by section preserving insertion order
      const sectionMap = new Map<string, { section: string; sectionType: string; tasks: typeof tasks }>();
      for (const task of tasks) {
        if (!sectionMap.has(task.section)) {
          sectionMap.set(task.section, { section: task.section, sectionType: task.sectionType, tasks: [] });
        }
        sectionMap.get(task.section)!.tasks.push(task);
      }
      return Array.from(sectionMap.values());
    }),

  // NEW: Update single onboarding task status
  updateTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.string(), status: taskStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.onboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { id: true, companyId: true, status: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      const updated = await ctx.db.onboardingTask.update({
        where: { id: input.taskId },
        data: {
          status: input.status,
          completedAt: input.status === 'DONE' ? new Date() : null,
        },
      });

      // Auto-activate hire when "Contract" task is marked Done
      if (input.status === 'DONE' && task.title.toLowerCase().includes('contract') && task.employee.status === 'PENDING_HIRE') {
        const bcrypt = await import('bcryptjs');
        const emp = await ctx.db.employee.findUnique({ where: { id: task.employee.id } });
        if (emp) {
          await ctx.db.employee.update({ where: { id: emp.id }, data: { status: 'ACTIVE' } });
          const passwordHash = await bcrypt.hash('password123', 10);
          await ctx.db.user.create({
            data: { email: emp.email, passwordHash, role: 'EMPLOYEE', employeeId: emp.id },
          }).catch(() => {});
        }
      }

      return updated;
    }),

  // Update task fields (title, notes, dueDate)
  // Delete onboarding task
  deleteTask: hrProtectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.onboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      return ctx.db.onboardingTask.delete({ where: { id: input.taskId } });
    }),

  // Delete offboarding task
  deleteOffboardingTask: hrProtectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.offboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      return ctx.db.offboardingTask.delete({ where: { id: input.taskId } });
    }),

  updateTask: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      title: z.string().optional(),
      notes: z.string().nullable().optional(),
      dueDate: z.coerce.date().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.onboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      const data: any = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate;
      return ctx.db.onboardingTask.update({ where: { id: input.taskId }, data });
    }),

  // Update offboarding task fields (title, notes, dueDate)
  updateOffboardingTask: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      title: z.string().optional(),
      notes: z.string().nullable().optional(),
      dueDate: z.coerce.date().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.offboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      const data: any = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate;
      return ctx.db.offboardingTask.update({ where: { id: input.taskId }, data });
    }),

  // Update task assignee
  updateTaskAssignee: protectedProcedure
    .input(z.object({ taskId: z.string(), assigneeId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.onboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      const updated = await ctx.db.onboardingTask.update({
        where: { id: input.taskId },
        data: { assigneeId: input.assigneeId },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          employee: { select: { id: true, firstName: true, lastName: true, companyId: true } },
        },
      });

      // Notify the new assignee about the task
      if (input.assigneeId && input.assigneeId !== ctx.user.employeeId) {
        await notifyService.send({
          companyId: ctx.user.companyId,
          recipients: [input.assigneeId],
          eventType: 'TASK_ASSIGNED',
          title: `Task assigned: ${task.title}`,
          message: `You have been assigned an onboarding task for ${updated.employee.firstName} ${updated.employee.lastName}.`,
          linkUrl: '/lifecycle/onboarding',
        });
      }

      return updated;
    }),

  // Update offboarding task assignee
  updateOffboardingTaskAssignee: protectedProcedure
    .input(z.object({ taskId: z.string(), assigneeId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.offboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      const updated = await ctx.db.offboardingTask.update({
        where: { id: input.taskId },
        data: { assigneeId: input.assigneeId },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          employee: { select: { id: true, firstName: true, lastName: true, companyId: true } },
        },
      });

      // Notify the new assignee about the task
      if (input.assigneeId && input.assigneeId !== ctx.user.employeeId) {
        await notifyService.send({
          companyId: ctx.user.companyId,
          recipients: [input.assigneeId],
          eventType: 'TASK_ASSIGNED',
          title: `Task assigned: ${task.title}`,
          message: `You have been assigned an offboarding task for ${updated.employee.firstName} ${updated.employee.lastName}.`,
          linkUrl: '/lifecycle/offboarding',
        });
      }

      return updated;
    }),

  // NEW: Start offboarding for a terminated employee
  startOffboarding: hrProtectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      return ctx.db.offboardingTask.createMany({
        data: DEFAULT_OFFBOARDING_TASKS.map(t => ({
          ...t,
          employeeId: input.employeeId,
          status: 'NOT_STARTED',
        })),
        skipDuplicates: true,
      });
    }),

  // NEW: Get offboarding checklist grouped by section
  getOffboardingChecklist: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const employee = await ctx.db.employee.findFirst({
        where: { id: input.employeeId, companyId: ctx.user.companyId }
      });
      if (!employee) throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee not found' });

      const tasks = await ctx.db.offboardingTask.findMany({
        where: { employeeId: input.employeeId },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });

      const sectionMap = new Map<string, { section: string; tasks: typeof tasks }>();
      for (const task of tasks) {
        if (!sectionMap.has(task.section)) {
          sectionMap.set(task.section, { section: task.section, tasks: [] });
        }
        sectionMap.get(task.section)!.tasks.push(task);
      }
      return Array.from(sectionMap.values());
    }),

  // NEW: Update single offboarding task status
  updateOffboardingTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.string(), status: taskStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.offboardingTask.findUnique({
        where: { id: input.taskId },
        include: { employee: { select: { companyId: true } } },
      });
      if (!task || task.employee.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Task not found' });
      }
      return ctx.db.offboardingTask.update({
        where: { id: input.taskId },
        data: {
          status: input.status,
          completedAt: input.status === 'DONE' ? new Date() : null,
        },
      });
    }),

  // NEW: List employees being offboarded (TERMINATED status)
  listOffboarding: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'TERMINATED' },
      include: {
        offboardingTasks: {
          orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
          include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
        department: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'desc' },
    });
  }),
});
