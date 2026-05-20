import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// -----------------------------------------------------------------------
// Minimal in-memory mock for Prisma (no live DB needed for unit tests)
// -----------------------------------------------------------------------

const db = {
  jobPosting: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  candidate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

function makeCtx() {
  return {
    db: db as any,
    session: {
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
      expires: '',
    },
    user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
  };
}

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/server/trpc', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
  const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
  });
  return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure.use(isAuthed) };
});

import { hiringRouter } from '@/server/routers/hiring';

function createCaller(ctx: any) {
  return hiringRouter.createCaller(ctx);
}

describe('hiringRouter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // -----------------------------------------------------------------------
  // H-1: listJobs returns jobs filtered by status: 'OPEN' for caller's company
  // -----------------------------------------------------------------------
  describe('listJobs', () => {
    it('H-1: returns jobs filtered by status OPEN for caller\'s company', async () => {
      db.jobPosting.findMany.mockResolvedValue([{
        id: 'job-1', title: 'Frontend Engineer', status: 'OPEN',
        companyId: 'co-1', createdAt: new Date(),
        _count: { candidates: 5 },
        department: { name: 'Engineering' },
        site: { name: 'NYC' },
      }]);

      const caller = createCaller(makeCtx());
      const result = await caller.listJobs({ status: 'OPEN', limit: 10 });

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe('Frontend Engineer');
      expect(result.jobs[0].status).toBe('OPEN');
      expect(db.jobPosting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1', status: 'OPEN' }) })
      );
      expect(result.nextCursor).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // H-2: listJobs returns _count.candidates, department.name, site.name
    // -----------------------------------------------------------------------
    it('H-2: returns jobs with candidate count and related department/site names (Fix A)', async () => {
      db.jobPosting.findMany.mockResolvedValue([{
        id: 'job-1', title: 'Frontend Engineer', status: 'OPEN',
        companyId: 'co-1', createdAt: new Date(),
        _count: { candidates: 5 },
        department: { name: 'Engineering' },
        site: { name: 'NYC' },
      }]);

      const caller = createCaller(makeCtx());
      const result = await caller.listJobs({ limit: 10 });

      expect(result.jobs[0]._count.candidates).toBe(5);
      expect((result.jobs[0] as any).department.name).toBe('Engineering');
      expect((result.jobs[0] as any).site.name).toBe('NYC');
      expect(db.jobPosting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            _count: expect.anything(),
            department: expect.anything(),
            site: expect.anything(),
          }),
        })
      );
    });

    // -----------------------------------------------------------------------
    // H-3: listJobs returns empty array when no jobs exist
    // -----------------------------------------------------------------------
    it('H-3: returns empty jobs array when company has no job postings', async () => {
      db.jobPosting.findMany.mockResolvedValue([]);

      const caller = createCaller(makeCtx());
      const result = await caller.listJobs({ limit: 10 });

      expect(result.jobs).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // H-4: listJobs cursor pagination returns nextCursor when more items exist
    // -----------------------------------------------------------------------
    it('H-4: returns nextCursor when result set exceeds the requested limit', async () => {
      db.jobPosting.findMany.mockResolvedValue([
        { id: 'job-1', title: 'Job 1', status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
          _count: { candidates: 0 }, department: { name: 'Eng' }, site: { name: 'NYC' } },
        { id: 'job-2', title: 'Job 2', status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
          _count: { candidates: 0 }, department: { name: 'Eng' }, site: { name: 'NYC' } },
        { id: 'job-3', title: 'Job 3', status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
          _count: { candidates: 0 }, department: { name: 'Eng' }, site: { name: 'NYC' } },
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.listJobs({ limit: 2 });

      expect(result.jobs).toHaveLength(2);
      expect(result.nextCursor).toBe('job-3');
    });
  });

  // -----------------------------------------------------------------------
  // H-5: createJob creates job with required fields and returns created record
  // -----------------------------------------------------------------------
  describe('createJob', () => {
    it('H-5: creates a job posting with title, description, and status, returning the record', async () => {
      db.jobPosting.create.mockResolvedValue({
        id: 'job-new', title: 'Backend Engineer', description: 'Build APIs for the platform.',
        status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
        salaryMin: null, salaryMax: null,
        _count: { candidates: 0 },
      });

      const caller = createCaller(makeCtx());
      const result = await caller.createJob({
        title: 'Backend Engineer',
        description: 'Build APIs for the platform.',
        status: 'OPEN',
      });

      expect(result.id).toBe('job-new');
      expect(result.title).toBe('Backend Engineer');
      expect(result.status).toBe('OPEN');
      expect(db.jobPosting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Backend Engineer', companyId: 'co-1' }),
        })
      );
      // Fix C: data object must NOT contain department, location, or jobType
      const callArgs = db.jobPosting.create.mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('department');
      expect(callArgs.data).not.toHaveProperty('location');
      expect(callArgs.data).not.toHaveProperty('jobType');
    });

    // -----------------------------------------------------------------------
    // H-6: createJob returns job with _count.candidates = 0
    // -----------------------------------------------------------------------
    it('H-6: returns newly created job with _count.candidates of 0', async () => {
      db.jobPosting.create.mockResolvedValue({
        id: 'job-new', title: 'QA Engineer', description: 'Ensure product quality always.',
        status: 'OPEN', companyId: 'co-1', createdAt: new Date(),
        salaryMin: null, salaryMax: null,
        _count: { candidates: 0 },
      });

      const caller = createCaller(makeCtx());
      const result = await caller.createJob({
        title: 'QA Engineer',
        description: 'Ensure product quality always.',
        status: 'OPEN',
      });

      expect(result._count.candidates).toBe(0);
      expect(db.jobPosting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { _count: { select: { candidates: true } } },
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // H-7: listCandidates returns candidates for a valid job
  // -----------------------------------------------------------------------
  describe('listCandidates', () => {
    it('H-7: returns all candidates for a job belonging to the caller\'s company', async () => {
      db.jobPosting.findUnique.mockResolvedValue({ id: 'job-1', companyId: 'co-1', title: 'Frontend Engineer' });
      db.candidate.findMany.mockResolvedValue([
        { id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'SCREENING',
          jobId: 'job-1', email: 'alice@example.com', phone: '555-1234', createdAt: new Date() },
        { id: 'c-2', firstName: 'Bob', lastName: 'Smith', stage: 'INTERVIEW',
          jobId: 'job-1', email: 'bob@example.com', phone: '555-5678', createdAt: new Date() },
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCandidates({ jobId: 'job-1', limit: 10 });

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].firstName).toBe('Alice');
      expect(result.candidates[1].stage).toBe('INTERVIEW');
      expect(result.nextCursor).toBeUndefined();
      expect(db.jobPosting.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job-1' } })
      );
    });

    // -----------------------------------------------------------------------
    // H-8: listCandidates throws NOT_FOUND when jobId does not exist
    // -----------------------------------------------------------------------
    it('H-8: throws NOT_FOUND TRPCError when the requested job does not exist', async () => {
      db.jobPosting.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.listCandidates({ jobId: 'nonexistent-job', limit: 10 })
      ).rejects.toThrow(TRPCError);

      expect(db.candidate.findMany).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // H-9: listCandidates throws FORBIDDEN when job belongs to a different company
    // -----------------------------------------------------------------------
    it('H-9: throws FORBIDDEN TRPCError when job is owned by a different company', async () => {
      db.jobPosting.findUnique.mockResolvedValue({ id: 'job-other', companyId: 'co-2', title: 'Some Job' });

      const caller = createCaller(makeCtx());
      await expect(
        caller.listCandidates({ jobId: 'job-other', limit: 10 })
      ).rejects.toThrow(TRPCError);

      expect(db.candidate.findMany).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // H-10: listCandidates applies stage filter to DB query when stage is provided
    // -----------------------------------------------------------------------
    it('H-10: applies stage filter to the database query when stage is provided', async () => {
      db.jobPosting.findUnique.mockResolvedValue({ id: 'job-1', companyId: 'co-1' });
      db.candidate.findMany.mockResolvedValue([
        { id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'INTERVIEW',
          jobId: 'job-1', email: 'alice@example.com', phone: '555-1234', createdAt: new Date() },
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCandidates({ jobId: 'job-1', stage: 'INTERVIEW', limit: 10 });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].stage).toBe('INTERVIEW');
      expect(db.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ jobId: 'job-1', stage: 'INTERVIEW' }) })
      );
    });

    // -----------------------------------------------------------------------
    // H-11: listCandidates returns all candidates when no stage filter is provided
    // -----------------------------------------------------------------------
    it('H-11: returns candidates in all stages when no stage filter is passed', async () => {
      db.jobPosting.findUnique.mockResolvedValue({ id: 'job-1', companyId: 'co-1' });
      db.candidate.findMany.mockResolvedValue([
        { id: 'c-1', stage: 'SCREENING', jobId: 'job-1', firstName: 'Alice', lastName: 'Brown',
          email: 'alice@example.com', phone: '555-1234', createdAt: new Date() },
        { id: 'c-2', stage: 'OFFER', jobId: 'job-1', firstName: 'Carol', lastName: 'White',
          email: 'carol@example.com', phone: '555-9999', createdAt: new Date() },
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.listCandidates({ jobId: 'job-1', limit: 10 });

      expect(result.candidates).toHaveLength(2);
      expect(db.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { jobId: 'job-1' } })
      );
    });
  });

  // -----------------------------------------------------------------------
  // H-12: addCandidate creates candidate with stage set to 'SCREENING'
  // -----------------------------------------------------------------------
  describe('addCandidate', () => {
    it('H-12: creates a new candidate with stage defaulting to SCREENING', async () => {
      db.jobPosting.findUnique.mockResolvedValue({ id: 'job-1', companyId: 'co-1' });
      db.candidate.create.mockResolvedValue({
        id: 'c-new', firstName: 'Dave', lastName: 'Jones',
        email: 'dave@example.com', phone: '555-0001',
        jobId: 'job-1', stage: 'SCREENING', source: 'LINKEDIN',
        resume: null, createdAt: new Date(),
      });

      const caller = createCaller(makeCtx());
      const result = await caller.addCandidate({
        jobId: 'job-1',
        firstName: 'Dave',
        lastName: 'Jones',
        email: 'dave@example.com',
        source: 'LINKEDIN',
      });

      expect(result.stage).toBe('SCREENING');
      expect(result.firstName).toBe('Dave');
      expect(db.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: 'SCREENING', jobId: 'job-1' }),
        })
      );
    });

    // -----------------------------------------------------------------------
    // H-13: addCandidate throws NOT_FOUND when jobId does not exist
    // -----------------------------------------------------------------------
    it('H-13: throws NOT_FOUND TRPCError when the target job does not exist', async () => {
      db.jobPosting.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.addCandidate({
          jobId: 'nonexistent-job',
          firstName: 'Dave', lastName: 'Jones',
          email: 'dave@example.com',
          source: 'OTHER',
        })
      ).rejects.toThrow(TRPCError);

      expect(db.candidate.create).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // H-14: addCandidate throws FORBIDDEN when job belongs to a different company
    // -----------------------------------------------------------------------
    it('H-14: throws FORBIDDEN TRPCError when job is owned by a different company', async () => {
      db.jobPosting.findUnique.mockResolvedValue({ id: 'job-other', companyId: 'co-2' });

      const caller = createCaller(makeCtx());
      await expect(
        caller.addCandidate({
          jobId: 'job-other',
          firstName: 'Dave', lastName: 'Jones',
          email: 'dave@example.com',
          source: 'OTHER',
        })
      ).rejects.toThrow(TRPCError);

      expect(db.candidate.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // H-15: moveStage updates candidate stage and returns the updated record
  // -----------------------------------------------------------------------
  describe('moveStage', () => {
    it('H-15: updates candidate stage to the provided value and returns the updated record', async () => {
      db.candidate.findUnique.mockResolvedValue({
        id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'SCREENING',
        jobId: 'job-1',
        job: { id: 'job-1', companyId: 'co-1' },
      });
      db.candidate.update.mockResolvedValue({
        id: 'c-1', firstName: 'Alice', lastName: 'Brown', stage: 'INTERVIEW',
        jobId: 'job-1',
      });

      const caller = createCaller(makeCtx());
      const result = await caller.moveStage({ candidateId: 'c-1', stage: 'INTERVIEW' });

      expect(result.stage).toBe('INTERVIEW');
      expect(db.candidate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1' }, include: { job: true } })
      );
      expect(db.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1' }, data: { stage: 'INTERVIEW' } })
      );
    });

    // -----------------------------------------------------------------------
    // H-16: moveStage throws NOT_FOUND when candidateId does not exist
    // -----------------------------------------------------------------------
    it('H-16: throws NOT_FOUND TRPCError when the candidate does not exist', async () => {
      db.candidate.findUnique.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.moveStage({ candidateId: 'nonexistent-candidate', stage: 'INTERVIEW' })
      ).rejects.toThrow(TRPCError);

      expect(db.candidate.update).not.toHaveBeenCalled();
    });
  });
});
