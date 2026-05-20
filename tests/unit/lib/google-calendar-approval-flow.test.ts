import { describe, it, expect, beforeEach, vi } from 'vitest';

// -----------------------------------------------------------------------
// Minimal in-memory mock for Prisma (same pattern as timeoff.router.test.ts)
// -----------------------------------------------------------------------
const mockEmployee = { id: 'emp-1', firstName: 'Alice', lastName: 'Tester', companyId: 'co-1' };
const mockPolicy = { id: 'pol-1', companyId: 'co-1', name: 'Vacation', type: 'VACATION', accrualRate: 2.083, maxCarryOver: 5, allowNegative: false };
const baseRequest = {
  id: 'req-1',
  employeeId: 'emp-1',
  policyId: 'pol-1',
  startDate: new Date('2024-06-10'),
  endDate: new Date('2024-06-14'),
  days: 5,
  status: 'PENDING',
  reason: 'Summer trip',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  employee: mockEmployee,
  policy: mockPolicy,
  googleCalendarEventId: null,
};

const db = {
  timeOffRequest: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  timeOffPolicy: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  notification: {
    create: vi.fn(),
    createMany: vi.fn(),
  },
};

function makeCtx(overrides?: Record<string, unknown>) {
  const user = { id: 'user-1', email: 'a@b.com', role: 'EMPLOYEE', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice', ...overrides };
  return {
    db: db as any,
    session: { user, expires: '' },
    user,
  };
}

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
}));

const mockCreateTimeOffEvent = vi.fn().mockResolvedValue('evt-456');
vi.mock('@/lib/channels/google-calendar', () => ({
  createTimeOffEvent: (...args: any[]) => mockCreateTimeOffEvent(...args),
}));

vi.mock('@/server/trpc', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
  const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
  });
  return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure.use(isAuthed) };
});

import { timeoffRouter } from '@/server/routers/timeoff';

function createCaller(ctx: any) {
  return timeoffRouter.createCaller(ctx);
}

describe('approve -> Google Calendar sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createTimeOffEvent when all approval slots are resolved (allResolved=true)', async () => {
    const pendingReq = {
      ...baseRequest,
      status: 'PENDING',
      hrStatus: 'PENDING',
      teamLeaderId: null,
      teamLeaderStatus: 'SKIPPED',
      groupLeaderId: null,
      groupLeaderStatus: 'SKIPPED',
    };
    db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
    db.timeOffRequest.update.mockResolvedValue({
      ...pendingReq,
      status: 'APPROVED',
      hrStatus: 'APPROVED',
      reviewedBy: 'emp-admin',
      reviewedAt: new Date(),
    });
    db.user.findMany.mockResolvedValue([]);

    const ctx = makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' });
    await createCaller(ctx).approve({ requestId: 'req-1' });

    expect(mockCreateTimeOffEvent).toHaveBeenCalledTimes(1);
    const arg = mockCreateTimeOffEvent.mock.calls[0][0];
    expect(arg.employeeName).toBe('Alice Tester');
    expect(arg.policyName).toBe('Vacation');
    expect(arg.startDate).toEqual(new Date('2024-06-10'));
    expect(arg.endDate).toEqual(new Date('2024-06-14'));
    expect(arg.requestId).toBe('req-1');
    expect(arg.reason).toBe('Summer trip');
  });

  it('does NOT call createTimeOffEvent when only a partial approval happens (allResolved=false)', async () => {
    const pendingReq = {
      ...baseRequest,
      status: 'PENDING',
      hrStatus: 'PENDING',
      teamLeaderId: 'mgr-1',
      teamLeaderStatus: 'PENDING',
      groupLeaderId: null,
      groupLeaderStatus: 'SKIPPED',
    };
    db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
    db.timeOffRequest.update.mockResolvedValue({
      ...pendingReq,
      hrStatus: 'APPROVED',
      status: 'PENDING',
    });
    db.user.findMany.mockResolvedValue([]);

    const ctx = makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' });
    await createCaller(ctx).approve({ requestId: 'req-1' });

    expect(mockCreateTimeOffEvent).not.toHaveBeenCalled();
  });

  it('stores the returned event ID in the database via timeOffRequest.update', async () => {
    const pendingReq = {
      ...baseRequest,
      status: 'PENDING',
      hrStatus: 'PENDING',
      teamLeaderId: null,
      teamLeaderStatus: 'SKIPPED',
      groupLeaderId: null,
      groupLeaderStatus: 'SKIPPED',
    };
    db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
    db.timeOffRequest.update.mockResolvedValue({
      ...pendingReq,
      status: 'APPROVED',
      hrStatus: 'APPROVED',
      reviewedBy: 'emp-admin',
      reviewedAt: new Date(),
    });
    db.user.findMany.mockResolvedValue([]);
    mockCreateTimeOffEvent.mockResolvedValueOnce('evt-789');

    const ctx = makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' });
    await createCaller(ctx).approve({ requestId: 'req-1' });

    // Find the update call whose data includes googleCalendarEventId
    const gcalUpdateCall = db.timeOffRequest.update.mock.calls.find(
      (call: any) => call[0]?.data?.googleCalendarEventId,
    );
    expect(gcalUpdateCall).toBeDefined();
    expect(gcalUpdateCall![0].data.googleCalendarEventId).toBe('evt-789');
  });

  it('does NOT update the database when createTimeOffEvent returns null', async () => {
    const pendingReq = {
      ...baseRequest,
      status: 'PENDING',
      hrStatus: 'PENDING',
      teamLeaderId: null,
      teamLeaderStatus: 'SKIPPED',
      groupLeaderId: null,
      groupLeaderStatus: 'SKIPPED',
    };
    db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
    db.timeOffRequest.update.mockResolvedValue({
      ...pendingReq,
      status: 'APPROVED',
      hrStatus: 'APPROVED',
      reviewedBy: 'emp-admin',
      reviewedAt: new Date(),
    });
    db.user.findMany.mockResolvedValue([]);
    mockCreateTimeOffEvent.mockResolvedValueOnce(null);

    const ctx = makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' });
    await createCaller(ctx).approve({ requestId: 'req-1' });

    // update should only have been called once (the approval update, not a second for event ID)
    expect(db.timeOffRequest.update).toHaveBeenCalledTimes(1);
  });
});
