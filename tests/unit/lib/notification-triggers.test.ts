/**
 * Tests that notification triggers are wired into the correct routers.
 * Verifies R2: all event types from the plan have a notifyService.send() call site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockNotifySend = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/notify-service', () => ({
  notifyService: { send: (...args: any[]) => mockNotifySend(...args) },
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

vi.mock('@/lib/currency', () => ({
  getExchangeRates: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/docusign', () => ({
  isDocuSignConfigured: () => false,
  sendForSignature: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  storage: { getUrl: vi.fn() },
}));

vi.mock('@/lib/sse-manager', () => ({
  sseManager: { push: vi.fn() },
}));

vi.mock('@/lib/channels/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: () => true,
}));

vi.mock('@/lib/channels/slack', () => ({
  sendSlackDM: vi.fn().mockResolvedValue(undefined),
  isSlackConfigured: () => true,
}));

// Mock @slack/web-api to prevent import errors
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: vi.fn() },
    users: { lookupByEmail: vi.fn() },
  })),
}));

vi.mock('@/server/trpc', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
  const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
  });
  const requireHrAdmin = t.middleware(({ ctx, next }) => {
    if (!['HR', 'ADMIN', 'SUPER_ADMIN'].includes(ctx.session?.user?.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'HR/Admin access required' });
    return next({ ctx });
  });
  return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure.use(isAuthed), hrProtectedProcedure: t.procedure.use(isAuthed).use(requireHrAdmin) };
});

function makeCtx(db: any, overrides: Record<string, unknown> = {}) {
  const user = {
    id: 'user-1',
    email: 'admin@acme.com',
    role: 'ADMIN',
    companyId: 'co-1',
    employeeId: 'emp-admin',
    ...overrides,
  };
  return { db, session: { user, expires: '' }, user };
}

describe('document router — notification triggers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends DOCUMENT_SIGNED notification when a document is signed', async () => {
    const mockDoc = {
      id: 'doc-1',
      name: 'Employment Agreement',
      employeeId: 'emp-2',
      signatureStatus: 'SIGNED',
    };
    const db = {
      document: {
        update: vi.fn().mockResolvedValue(mockDoc),
      },
    };
    const { documentRouter } = await import('@/server/routers/document');
    const caller = documentRouter.createCaller(makeCtx(db));
    await caller.sign({ id: 'doc-1' });

    expect(mockNotifySend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'DOCUMENT_SIGNED',
        recipients: ['emp-2'],
        companyId: 'co-1',
      }),
    );
  });

  it('does NOT send DOCUMENT_SIGNED when the signer is the document owner', async () => {
    const mockDoc = {
      id: 'doc-1',
      name: 'Self-signed',
      employeeId: 'emp-admin', // same as ctx.user.employeeId
      signatureStatus: 'SIGNED',
    };
    const db = {
      document: {
        update: vi.fn().mockResolvedValue(mockDoc),
      },
    };
    const { documentRouter } = await import('@/server/routers/document');
    const caller = documentRouter.createCaller(makeCtx(db));
    await caller.sign({ id: 'doc-1' });

    expect(mockNotifySend).not.toHaveBeenCalled();
  });
});

describe('survey router — notification triggers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends SURVEY_PUBLISHED notification to all active employees when a survey is published', async () => {
    const mockSurvey = { id: 'survey-1', title: 'Q1 Feedback', description: 'Please share feedback', companyId: 'co-1', status: 'DRAFT' };
    const db = {
      survey: {
        findFirst: vi.fn().mockResolvedValue(mockSurvey),
        update: vi.fn().mockResolvedValue({ ...mockSurvey, status: 'ACTIVE' }),
      },
      employee: {
        findMany: vi.fn().mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }, { id: 'emp-3' }]),
      },
    };

    const { surveysRouter } = await import('@/server/routers/surveys');
    const caller = surveysRouter.createCaller(makeCtx(db));
    await caller.publish({ id: 'survey-1' });

    expect(mockNotifySend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SURVEY_PUBLISHED',
        recipients: ['emp-1', 'emp-2', 'emp-3'],
        companyId: 'co-1',
      }),
    );
  });
});

describe('onboarding router — notification triggers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends TASK_ASSIGNED notification when a task is created with an assignee', async () => {
    const mockEmp = { id: 'emp-2', firstName: 'Bob', lastName: 'Jones', companyId: 'co-1' };
    const mockTask = { id: 'task-1', title: 'Set up laptop', employeeId: 'emp-2', assigneeId: 'emp-3' };
    const db = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(mockEmp),
      },
      onboardingTask: {
        create: vi.fn().mockResolvedValue(mockTask),
      },
    };

    const { onboardingRouter } = await import('@/server/routers/onboarding');
    const caller = onboardingRouter.createCaller(makeCtx(db));
    await caller.createTask({
      employeeId: 'emp-2',
      title: 'Set up laptop',
      assigneeId: 'emp-3',
    });

    expect(mockNotifySend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'TASK_ASSIGNED',
        recipients: ['emp-3'],
        companyId: 'co-1',
      }),
    );
  });

  it('does NOT send TASK_ASSIGNED when the assignee is the current user', async () => {
    const mockEmp = { id: 'emp-2', firstName: 'Bob', lastName: 'Jones', companyId: 'co-1' };
    const mockTask = { id: 'task-1', title: 'Self-assign', employeeId: 'emp-2', assigneeId: 'emp-admin' };
    const db = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(mockEmp),
      },
      onboardingTask: {
        create: vi.fn().mockResolvedValue(mockTask),
      },
    };

    const { onboardingRouter } = await import('@/server/routers/onboarding');
    const caller = onboardingRouter.createCaller(makeCtx(db));
    await caller.createTask({
      employeeId: 'emp-2',
      title: 'Self-assign',
      assigneeId: 'emp-admin',
    });

    expect(mockNotifySend).not.toHaveBeenCalled();
  });
});

describe('onboarding router — offboarding task notification triggers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends TASK_ASSIGNED notification when an offboarding task assignee is changed', async () => {
    const mockTask = {
      id: 'off-task-1',
      title: 'Revoke VPN access',
      employeeId: 'emp-2',
      assigneeId: 'emp-3',
      employee: { companyId: 'co-1', firstName: 'Alice', lastName: 'Smith' },
    };
    const updatedTask = {
      ...mockTask,
      assignee: { id: 'emp-3', firstName: 'Bob', lastName: 'Jones', avatar: null },
      employee: { id: 'emp-2', firstName: 'Alice', lastName: 'Smith', companyId: 'co-1' },
    };
    const db = {
      offboardingTask: {
        findUnique: vi.fn().mockResolvedValue(mockTask),
        update: vi.fn().mockResolvedValue(updatedTask),
      },
    };

    const { onboardingRouter } = await import('@/server/routers/onboarding');
    const caller = onboardingRouter.createCaller(makeCtx(db));
    await caller.updateOffboardingTaskAssignee({
      taskId: 'off-task-1',
      assigneeId: 'emp-3',
    });

    expect(mockNotifySend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'TASK_ASSIGNED',
        recipients: ['emp-3'],
        companyId: 'co-1',
      }),
    );
  });

  it('does NOT send TASK_ASSIGNED when offboarding assignee is the current user', async () => {
    const mockTask = {
      id: 'off-task-1',
      title: 'Return laptop',
      employeeId: 'emp-2',
      assigneeId: 'emp-admin',
      employee: { companyId: 'co-1', firstName: 'Alice', lastName: 'Smith' },
    };
    const updatedTask = {
      ...mockTask,
      assignee: { id: 'emp-admin', firstName: 'Admin', lastName: 'User', avatar: null },
      employee: { id: 'emp-2', firstName: 'Alice', lastName: 'Smith', companyId: 'co-1' },
    };
    const db = {
      offboardingTask: {
        findUnique: vi.fn().mockResolvedValue(mockTask),
        update: vi.fn().mockResolvedValue(updatedTask),
      },
    };

    const { onboardingRouter } = await import('@/server/routers/onboarding');
    const caller = onboardingRouter.createCaller(makeCtx(db));
    await caller.updateOffboardingTaskAssignee({
      taskId: 'off-task-1',
      assigneeId: 'emp-admin',
    });

    expect(mockNotifySend).not.toHaveBeenCalled();
  });

  it('does NOT send TASK_ASSIGNED when offboarding assignee is set to null', async () => {
    const mockTask = {
      id: 'off-task-1',
      title: 'Cancel systems',
      employeeId: 'emp-2',
      assigneeId: null,
      employee: { companyId: 'co-1' },
    };
    const updatedTask = {
      ...mockTask,
      assignee: null,
    };
    const db = {
      offboardingTask: {
        findUnique: vi.fn().mockResolvedValue(mockTask),
        update: vi.fn().mockResolvedValue(updatedTask),
      },
    };

    const { onboardingRouter } = await import('@/server/routers/onboarding');
    const caller = onboardingRouter.createCaller(makeCtx(db));
    await caller.updateOffboardingTaskAssignee({
      taskId: 'off-task-1',
      assigneeId: null,
    });

    expect(mockNotifySend).not.toHaveBeenCalled();
  });
});

describe('employee router — notification triggers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends EMPLOYEE_UPDATED notification when department changes', async () => {
    const currentEmp = {
      id: 'emp-2',
      companyId: 'co-1',
      status: 'ACTIVE',
      departmentId: 'dept-old',
      managerId: null,
      workInfo: JSON.stringify({ jobTitle: 'Engineer' }),
      department: { name: 'Old Dept' },
      manager: null,
    };
    const updatedEmp = {
      ...currentEmp,
      departmentId: 'dept-new',
      department: { id: 'dept-new', name: 'New Dept' },
      company: {},
      manager: null,
    };
    const db = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(currentEmp),
        update: vi.fn().mockResolvedValue(updatedEmp),
      },
      jobRecord: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { employeeRouter } = await import('@/server/routers/employee');
    const caller = employeeRouter.createCaller(makeCtx(db));
    await caller.update({ id: 'emp-2', department: 'dept-new', createMilestone: true });

    expect(mockNotifySend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'EMPLOYEE_UPDATED',
        recipients: ['emp-2'],
        companyId: 'co-1',
      }),
    );
    // Verify the message mentions "department"
    const call = mockNotifySend.mock.calls[0][0];
    expect(call.message).toContain('department');
  });

  it('does NOT send EMPLOYEE_UPDATED when user updates their own profile', async () => {
    const currentEmp = {
      id: 'emp-admin', // same as ctx.user.employeeId
      companyId: 'co-1',
      status: 'ACTIVE',
      departmentId: 'dept-old',
      managerId: null,
      workInfo: JSON.stringify({}),
      department: { name: 'Old' },
      manager: null,
    };
    const updatedEmp = {
      ...currentEmp,
      departmentId: 'dept-new',
      department: { id: 'dept-new', name: 'New' },
      company: {},
      manager: null,
    };
    const db = {
      employee: {
        findUnique: vi.fn().mockResolvedValue(currentEmp),
        update: vi.fn().mockResolvedValue(updatedEmp),
      },
      jobRecord: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const { employeeRouter } = await import('@/server/routers/employee');
    const caller = employeeRouter.createCaller(makeCtx(db));
    await caller.update({ id: 'emp-admin', department: 'dept-new' });

    expect(mockNotifySend).not.toHaveBeenCalled();
  });
});
