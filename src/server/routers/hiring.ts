import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

const createJobSchema = z.object({
  title: z.string().min(1), description: z.string().min(10), department: z.string(),
  location: z.string(), jobType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
  salaryMin: z.number().positive().optional(), salaryMax: z.number().positive().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'ON_HOLD']).default('OPEN'),
});

const listJobsSchema = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'ON_HOLD']).optional(), department: z.string().optional(),
  limit: z.number().min(1).max(100).default(10), cursor: z.string().optional(),
});

const listCandidatesSchema = z.object({
  jobId: z.string(), stage: z.enum(['SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']).optional(),
  limit: z.number().min(1).max(100).default(10), cursor: z.string().optional(),
});

const addCandidateSchema = z.object({
  jobId: z.string(), firstName: z.string().min(1), lastName: z.string().min(1),
  email: z.string().email(), phone: z.string(), resumeUrl: z.string().optional(),
  source: z.enum(['LINKEDIN', 'REFERRAL', 'WEBSITE', 'RECRUITER', 'OTHER']).default('OTHER'),
});

const moveStageSchema = z.object({
  candidateId: z.string(), stage: z.enum(['SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
  notes: z.string().optional(),
});

export const hiringRouter = router({
  listJobs: protectedProcedure.input(listJobsSchema).query(async ({ ctx, input }) => {
    const { status, department, limit, cursor } = input;
    let where: any = { companyId: ctx.user.companyId };
    if (status) where.status = status;
    if (department) where.department = department;
    const jobs = await ctx.db.job.findMany({
      where, include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    let nextCursor: typeof cursor | undefined = undefined;
    if (jobs.length > limit) { const nextItem = jobs.pop(); nextCursor = nextItem?.id; }
    return { jobs, nextCursor };
  }),

  createJob: protectedProcedure.input(createJobSchema).mutation(async ({ ctx, input }) => {
    const job = await ctx.db.job.create({
      data: { ...input, companyId: ctx.user.companyId, createdAt: new Date() },
      include: { _count: { select: { candidates: true } } },
    });
    return job;
  }),

  listCandidates: protectedProcedure.input(listCandidatesSchema).query(async ({ ctx, input }) => {
    const { jobId, stage, limit, cursor } = input;
    const job = await ctx.db.job.findUnique({ where: { id: jobId } });
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    if (job.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this job' });
    let where: any = { jobId };
    if (stage) where.stage = stage;
    const candidates = await ctx.db.candidate.findMany({
      where, orderBy: { createdAt: 'desc' }, take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    let nextCursor: typeof cursor | undefined = undefined;
    if (candidates.length > limit) { const nextItem = candidates.pop(); nextCursor = nextItem?.id; }
    return { candidates, nextCursor };
  }),

  addCandidate: protectedProcedure.input(addCandidateSchema).mutation(async ({ ctx, input }) => {
    const job = await ctx.db.job.findUnique({ where: { id: input.jobId } });
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    if (job.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this job' });
    const candidate = await ctx.db.candidate.create({
      data: { jobId: input.jobId, firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone, resumeUrl: input.resumeUrl, source: input.source, stage: 'SCREENING', appliedDate: new Date() },
    });
    return candidate;
  }),

  moveStage: protectedProcedure.input(moveStageSchema).mutation(async ({ ctx, input }) => {
    const candidate = await ctx.db.candidate.findUnique({ where: { id: input.candidateId }, include: { job: true } });
    if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found' });
    if (candidate.job.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this candidate' });
    const updated = await ctx.db.candidate.update({
      where: { id: input.candidateId }, data: { stage: input.stage, stageUpdatedDate: new Date() },
    });
    return updated;
  }),
});
