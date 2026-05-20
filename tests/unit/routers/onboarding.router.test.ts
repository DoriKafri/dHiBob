import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../../src/server/routers/_app';
import { prisma } from '../../../src/lib/db';
import { TRPCError } from '@trpc/server';

vi.mock('../../../src/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../src/lib/db', () => ({
  prisma: {
    onboardingTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    offboardingTask: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    onboardingTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    }
  },
}));

describe('Onboarding Router', () => {
  it('should fetch my tasks', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'user-1' } },
      db: prisma
    } as any);
    (prisma.onboardingTask.findMany as any).mockResolvedValue([]);
    const result = await caller.onboarding.myTasks();
    expect(result).toEqual([]);
    // R-1: Updated from status: 'PENDING' to status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
    expect(prisma.onboardingTask.findMany).toHaveBeenCalledWith({
      where: { assigneeId: 'user-1', status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
    });
  });
});

describe('Onboarding Router - Admin', () => {
  it('should create a manual task', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    // R-2: assigneeType removed from input
    const input = {
      employeeId: 'emp-1',
      title: 'Manual Task',
      assigneeId: 'admin-1'
    };
    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTask.create as any).mockResolvedValue({ ...input, id: 'task-1' });

    const result = await caller.onboarding.createTask(input);
    expect(result.title).toBe('Manual Task');
    expect(prisma.onboardingTask.create).toHaveBeenCalled();
  });

  it('should throw FORBIDDEN if creating task for employee in another company', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    // R-2: assigneeType removed from input
    const input = {
      employeeId: 'emp-other',
      title: 'Manual Task',
    };
    (prisma.employee.findFirst as any).mockResolvedValue(null);

    await expect(caller.onboarding.createTask(input)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });

  it('should start onboarding from template', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTemplate.findFirst as any).mockResolvedValue({
      id: 'template-1',
      companyId: 'company-1',
      tasks: JSON.stringify(['Task 1', 'Task 2'])
    });
    (prisma.onboardingTask.createMany as any).mockResolvedValue({ count: 2 });

    const result = await caller.onboarding.start({
      employeeId: 'emp-1',
      templateId: 'template-1'
    });

    expect(result).toEqual({ count: 2 });
    expect(prisma.onboardingTemplate.findFirst).toHaveBeenCalled();
    expect(prisma.onboardingTask.createMany).toHaveBeenCalled();
  });

  it('should throw FORBIDDEN if starting onboarding for employee in another company', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue(null);

    await expect(caller.onboarding.start({
      employeeId: 'emp-other',
      templateId: 'template-1'
    })).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('should throw NOT_FOUND if template belongs to another company', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTemplate.findFirst as any).mockResolvedValue(null);

    await expect(caller.onboarding.start({
      employeeId: 'emp-1',
      templateId: 'template-other'
    })).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('should throw INTERNAL_SERVER_ERROR if template tasks are invalid JSON', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTemplate.findFirst as any).mockResolvedValue({
      id: 'template-1',
      companyId: 'company-1',
      tasks: 'invalid-json'
    });

    await expect(caller.onboarding.start({
      employeeId: 'emp-1',
      templateId: 'template-1'
    })).rejects.toThrow(expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }));
  });

  it('should list new hires', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);

    (prisma.employee.findMany as any).mockResolvedValue([
      { id: 'emp-1', name: 'New Hire 1', onboardingTasks: [] }
    ]);

    const result = await caller.onboarding.listNewHires();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New Hire 1');
    // R-3: Use expect.objectContaining for loose matching on the expanded include shape
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-1', status: { in: ['ACTIVE', 'PENDING_HIRE'] } },
      })
    );
  });

  it('should list templates for the current company', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma
    } as any);
    (prisma.onboardingTemplate.findMany as any).mockResolvedValue([]);
    const result = await caller.onboarding.listTemplates();
    expect(result).toBeDefined();
  });
});

describe('Onboarding Router - getChecklist', () => {
  it('O-1: getChecklist returns tasks for employee, grouped by section', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTask.findMany as any).mockResolvedValue([
      { id: 't1', section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Task 1', status: 'DONE', dueDate: null, notes: null, sortOrder: 1, assignee: null },
      { id: 't2', section: 'First day', sectionType: 'GENERAL', title: 'Task 2', status: 'NOT_STARTED', dueDate: null, notes: null, sortOrder: 1, assignee: null },
    ]);

    const result = await caller.onboarding.getChecklist({ employeeId: 'emp-1' });
    expect(result).toHaveLength(2);
    const sections = result.map((s: any) => s.section);
    expect(sections).toContain('Pre-arrival');
    expect(sections).toContain('First day');
  });

  it('O-2: getChecklist groups tasks by section correctly', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.onboardingTask.findMany as any).mockResolvedValue([
      { id: 't1', section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Task A', status: 'DONE', dueDate: null, notes: null, sortOrder: 1, assignee: null },
      { id: 't2', section: 'Pre-arrival', sectionType: 'GENERAL', title: 'Task B', status: 'NOT_STARTED', dueDate: null, notes: null, sortOrder: 2, assignee: null },
      { id: 't3', section: 'DevOps', sectionType: 'DEVOPS', title: 'AWS setup', status: 'NOT_STARTED', dueDate: null, notes: null, sortOrder: 1, assignee: null },
    ]);

    const result = await caller.onboarding.getChecklist({ employeeId: 'emp-1' });
    const preArrival = result.find((s: any) => s.section === 'Pre-arrival');
    expect(preArrival?.tasks).toHaveLength(2);
    const devops = result.find((s: any) => s.section === 'DevOps');
    expect(devops?.tasks).toHaveLength(1);
  });

  it('O-3: getChecklist throws FORBIDDEN for employee in another company', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);
    (prisma.employee.findFirst as any).mockResolvedValue(null);

    await expect(
      caller.onboarding.getChecklist({ employeeId: 'emp-other' })
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('Onboarding Router - updateTaskStatus', () => {
  it('O-4: updateTaskStatus persists the new status', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.onboardingTask.findUnique as any).mockResolvedValue({
      id: 't1', employee: { companyId: 'company-1' },
    });
    (prisma.onboardingTask.update as any).mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });

    const result = await caller.onboarding.updateTaskStatus({ taskId: 't1', status: 'IN_PROGRESS' });
    expect(result.status).toBe('IN_PROGRESS');
    expect(prisma.onboardingTask.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    });
  });
});

describe('Onboarding Router - Offboarding', () => {
  it('O-5: startOffboarding creates offboarding tasks for the employee', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findFirst as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' });
    (prisma.offboardingTask.createMany as any).mockResolvedValue({ count: 5 });

    const result = await caller.onboarding.startOffboarding({ employeeId: 'emp-1' });
    expect(result.count).toBeGreaterThan(0);
    expect(prisma.offboardingTask.createMany).toHaveBeenCalled();
  });

  it('O-6: updateOffboardingTaskStatus persists the new status', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.offboardingTask.findUnique as any).mockResolvedValue({
      id: 'ot1', employee: { companyId: 'company-1' },
    });
    (prisma.offboardingTask.update as any).mockResolvedValue({ id: 'ot1', status: 'DONE' });

    const result = await caller.onboarding.updateOffboardingTaskStatus({ taskId: 'ot1', status: 'DONE' });
    expect(result.status).toBe('DONE');
  });

  it('O-7: listOffboarding returns only TERMINATED employees with company isolation', async () => {
    const caller = appRouter.createCaller({
      session: { user: { id: 'admin-1', role: 'ADMIN', companyId: 'company-1' } },
      db: prisma,
    } as any);

    (prisma.employee.findMany as any).mockResolvedValue([
      { id: 'emp-term', firstName: 'John', lastName: 'Doe', status: 'TERMINATED', offboardingTasks: [] }
    ]);

    const result = await caller.onboarding.listOffboarding();
    expect(result).toHaveLength(1);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'company-1', status: 'TERMINATED' }),
    }));
  });
});
