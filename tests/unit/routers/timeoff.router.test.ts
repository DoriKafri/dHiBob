import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// -----------------------------------------------------------------------
// Minimal in-memory mock for Prisma (no live DB needed for unit tests)
// -----------------------------------------------------------------------
// const mockCompany = { id: 'co-1' };
const mockEmployee = { id: 'emp-1', firstName: 'Alice', lastName: 'Tester', companyId: 'co-1' };
const mockPolicy = { id: 'pol-1', companyId: 'co-1', name: 'Vacation', type: 'VACATION', accrualRate: 2.083, maxCarryOver: 5, allowNegative: false };
const mockRequest = {
  id: 'req-1', employeeId: 'emp-1', policyId: 'pol-1', startDate: new Date('2024-06-10'),
  endDate: new Date('2024-06-14'), days: 5, status: 'PENDING', reason: 'Summer trip',
  reviewedBy: null, reviewedAt: null, createdAt: new Date(), updatedAt: new Date(),
  employee: mockEmployee, policy: mockPolicy,
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

// Import the router factory (not the full router to avoid Next.js module deps)
// We test the procedures via createCaller-equivalent: call the handler functions directly.
// Since the router uses Prisma via ctx.db, we inject our mock db.

// NOTE: These tests verify the fixed router logic. Run them via:
// npx vitest run tests/unit/routers/timeoff.router.test.ts
// They will FAIL until Task 3 fixes are applied (the current router has schema bugs).

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
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

describe('timeoffRouter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listPolicies', () => {
    it('returns policies for the current company', async () => {
      db.timeOffPolicy.findMany.mockResolvedValue([mockPolicy]);
      const result = await createCaller(makeCtx()).listPolicies();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Vacation');
      expect(db.timeOffPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'co-1' } })
      );
    });
  });

  describe('listRequests', () => {
    it('returns requests with employee and policy', async () => {
      db.timeOffRequest.findMany.mockResolvedValue([mockRequest]);
      const result = await createCaller(makeCtx()).listRequests({ limit: 10 });
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].employee.firstName).toBe('Alice');
    });

    it('filters by status', async () => {
      db.timeOffRequest.findMany.mockResolvedValue([]);
      await createCaller(makeCtx()).listRequests({ status: 'PENDING', limit: 10 });
      expect(db.timeOffRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) })
      );
    });

    it('does NOT include approver in the query (relation does not exist)', async () => {
      db.timeOffRequest.findMany.mockResolvedValue([mockRequest]);
      await createCaller(makeCtx()).listRequests({ limit: 10 });
      const call = db.timeOffRequest.findMany.mock.calls[0][0];
      expect(call.include?.approver).toBeUndefined();
    });
  });

  describe('submitRequest', () => {
    it('creates a request with policyId, not type', async () => {
      db.employee.findUnique.mockResolvedValue(mockEmployee);
      db.timeOffPolicy.findUnique.mockResolvedValue(mockPolicy);
      db.timeOffRequest.create.mockResolvedValue({ ...mockRequest, status: 'PENDING' });
      const result = await createCaller(makeCtx()).submitRequest({
        employeeId: 'emp-1',
        policyId: 'pol-1',
        startDate: new Date('2024-06-10'),
        endDate: new Date('2024-06-14'),
        reason: 'Summer trip',
      });
      expect(result.status).toBe('PENDING');
      const createCall = db.timeOffRequest.create.mock.calls[0][0];
      expect(createCall.data.policyId).toBe('pol-1');
      expect(createCall.data.type).toBeUndefined();
      expect(createCall.data.requestedDate).toBeUndefined();
    });

    it('throws FORBIDDEN when employee is from another company', async () => {
      db.employee.findUnique.mockResolvedValue({ ...mockEmployee, companyId: 'other-co' });
      await expect(
        createCaller(makeCtx()).submitRequest({
          employeeId: 'emp-1', policyId: 'pol-1',
          startDate: new Date('2024-06-10'), endDate: new Date('2024-06-14'),
        })
      ).rejects.toThrow(TRPCError);
    });

    it('throws BAD_REQUEST when endDate is before startDate', async () => {
      db.employee.findUnique.mockResolvedValue(mockEmployee);
      await expect(
        createCaller(makeCtx()).submitRequest({
          employeeId: 'emp-1', policyId: 'pol-1',
          startDate: new Date('2024-06-14'), endDate: new Date('2024-06-10'),
        })
      ).rejects.toThrow(TRPCError);
      // Note: same startDate === endDate is valid (single-day request, days = 1)
    });
  });

  describe('approve', () => {
    it('approves the HR slot for an HR/Admin user; overall APPROVED once all slots resolved', async () => {
      // Request has no team/group leader (both SKIPPED) and HR slot PENDING
      const pendingReq = {
        ...mockRequest,
        status: 'PENDING',
        hrStatus: 'PENDING',
        teamLeaderId: null,
        teamLeaderStatus: 'SKIPPED',
        groupLeaderId: null,
        groupLeaderStatus: 'SKIPPED',
      };
      db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
      db.timeOffRequest.update.mockResolvedValue({ ...pendingReq, status: 'APPROVED', reviewedBy: 'emp-admin', reviewedAt: new Date() });
      const ctx = makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' });
      const result = await createCaller(ctx).approve({ requestId: 'req-1' });
      expect(result.status).toBe('APPROVED');
      const updateCall = db.timeOffRequest.update.mock.calls[0][0];
      expect(updateCall.data.hrStatus).toBe('APPROVED');
      expect(updateCall.data.hrApprovedBy).toBe('emp-admin');
      expect(updateCall.data.status).toBe('APPROVED');
      expect(updateCall.data.reviewedAt).toBeInstanceOf(Date);
    });

    it('rejects approval from a non-eligible user (employee with no approver role)', async () => {
      const pendingReq = {
        ...mockRequest,
        hrStatus: 'PENDING',
        teamLeaderId: 'mgr-x',
        teamLeaderStatus: 'PENDING',
        groupLeaderId: null,
        groupLeaderStatus: 'SKIPPED',
      };
      db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
      await expect(createCaller(makeCtx()).approve({ requestId: 'req-1' })).rejects.toThrow(TRPCError);
    });
  });

  describe('reject', () => {
    it('sets status REJECTED when an eligible approver rejects', async () => {
      const pendingReq = {
        ...mockRequest,
        hrStatus: 'PENDING',
        teamLeaderId: null,
        teamLeaderStatus: 'SKIPPED',
        groupLeaderId: null,
        groupLeaderStatus: 'SKIPPED',
      };
      db.timeOffRequest.findUnique.mockResolvedValue(pendingReq);
      db.timeOffRequest.update.mockResolvedValue({ ...pendingReq, status: 'REJECTED', reviewedBy: 'emp-admin', reviewedAt: new Date() });
      const ctx = makeCtx({ role: 'ADMIN', employeeId: 'emp-admin' });
      const result = await createCaller(ctx).reject({ requestId: 'req-1' });
      expect(result.status).toBe('REJECTED');
      const updateCall = db.timeOffRequest.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('REJECTED');
      expect(updateCall.data.hrStatus).toBe('REJECTED');
    });
  });

  describe('getBalance', () => {
    it('filters balance by policy.type, not r.type', async () => {
      // Use days:1 per request so the sum equals the count (easier to reason about)
      const vacReq = { ...mockRequest, days: 1, policy: { ...mockPolicy, type: 'VACATION' } };
      const sickReq = { ...mockRequest, id: 'req-2', days: 1, policy: { ...mockPolicy, type: 'SICK' } };
      db.employee.findUnique.mockResolvedValue(mockEmployee);
      db.timeOffRequest.findMany.mockResolvedValue([vacReq, sickReq]);
      const result = await createCaller(makeCtx()).getBalance({ employeeId: 'emp-1' });
      // getBalance sums r.days (not counts requests), so with days:1 each the totals are 1
      expect(result.vacation.used).toBe(1);
      expect(result.sick.used).toBe(1);
      expect(result.personal.used).toBe(0);
    });
  });
});
