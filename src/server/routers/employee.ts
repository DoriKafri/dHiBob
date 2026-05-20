import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { getExchangeRates } from '@/lib/currency';
import { storage } from '@/lib/storage';
import { notifyService } from '@/lib/notify-service';
import { encryptPersonalInfo, decryptPersonalInfo } from '@/lib/encryption';

const createEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  startDate: z.coerce.date(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
  manager: z.string().optional(),
  site: z.string().optional(),
  salary: z.number().positive().optional(),
  companyId: z.string(),
  avatar: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
});

const updateEmployeeSchema = createEmployeeSchema.partial().extend({ 
  id: z.string(),
  createMilestone: z.boolean().optional(),
});

const terminateEmployeeSchema = z.object({
  id: z.string(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

const listEmployeesSchema = z.object({
  limit: z.number().min(1).max(1000).default(10),
  cursor: z.string().optional(),
  search: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
  site: z.string().optional(),
});

export const employeeRouter = router({
  list: protectedProcedure.input(listEmployeesSchema).query(async ({ ctx, input }) => {
    const { limit, cursor, search, department, status, site } = input;
    let where: any = { companyId: ctx.user.companyId };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (department) where.department = { name: department };
    if (status) where.status = status;
    if (site) where.site = site;
    const employees = await ctx.db.employee.findMany({
      where,
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        user: { select: { id: true, email: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    let nextCursor: typeof cursor | undefined = undefined;
    if (employees.length > limit) {
      employees.pop();
      nextCursor = employees[employees.length - 1]?.id;
    }
    return { employees, nextCursor };
  }),

  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const employee = await ctx.db.employee.findUnique({
      where: { id: input.id },
      include: {
        company: true,
        manager: {
          include: {
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        department: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        directReports: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, email: true, role: true } },
      },
    });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this employee' });
    const isSelf = ctx.user.employeeId === input.id;
    const isAdminRole = ['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATOR'].includes(ctx.user.role);
    // Strip sensitive data for non-admin/non-self
    if (!isSelf && !isAdminRole) {
      (employee as any).personalInfo = '{}';
      (employee as any).workInfo = '{}';
    } else {
      // Decrypt encrypted PII fields before returning
      try {
        const pi = JSON.parse(employee.personalInfo || '{}');
        (employee as any).personalInfo = JSON.stringify(decryptPersonalInfo(pi));
      } catch {}
    }
    return employee;
  }),

  create: protectedProcedure.input(createEmployeeSchema).mutation(async ({ ctx, input }) => {
    if (input.companyId !== ctx.user.companyId && ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OPERATOR') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to create employees' });
    }
    const existingUser = await ctx.db.user.findUnique({ where: { email: input.email } });
    if (existingUser) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already in use' });
    const employee = await ctx.db.employee.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: `${input.firstName} ${input.lastName}`,
        email: input.email,
        startDate: input.startDate,
        employmentType: input.employmentType,
        managerId: input.manager,
        companyId: input.companyId,
        status: 'ACTIVE',
        workInfo: JSON.stringify({ jobTitle: input.jobTitle }),
      },
      include: { company: true, manager: true },
    });

    // Automatically create "HIRED" milestone
    await ctx.db.jobRecord.create({
      data: {
        employeeId: employee.id,
        type: 'HIRED',
        effectiveDate: input.startDate,
        title: 'Joined the company',
        description: `Started as ${input.jobTitle || 'Employee'}`,
        metadata: JSON.stringify({ title: input.jobTitle }),
      }
    });

    return employee;
  }),

  createJobRecord: protectedProcedure.input(z.object({
    employeeId: z.string(),
    type: z.enum(['HIRED', 'PROMOTION', 'DEPT_CHANGE', 'MANAGER_CHANGE', 'NOTE']),
    effectiveDate: z.coerce.date(),
    title: z.string().min(1),
    description: z.string().optional(),
    metadata: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const employee = await ctx.db.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
    }

    return ctx.db.jobRecord.create({
      data: {
        ...input,
        metadata: input.metadata || '{}',
      },
    });
  }),

  update: protectedProcedure.input(updateEmployeeSchema).mutation(async ({ ctx, input }) => {
    const { id, createMilestone, ...updateData } = input;
    const current = await ctx.db.employee.findUnique({ 
      where: { id },
      include: { department: true, manager: true }
    });
    if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (current.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to update this employee' });
    
    const currentWorkInfo = JSON.parse(current.workInfo || '{}');
    const oldJobTitle = currentWorkInfo.jobTitle;

    // eslint-disable-next-line no-unused-vars
    const { department, site, jobTitle, salary, manager, companyId: _cid, ...scalarData } = updateData;
    
    const updated = await ctx.db.employee.update({
      where: { id }, 
      data: {
        ...scalarData,
        departmentId: department,
        siteId: site,
        managerId: manager,
        workInfo: jobTitle ? JSON.stringify({ ...currentWorkInfo, jobTitle }) : current.workInfo,
      },
      include: { company: true, manager: true, department: true },
    });

    if (createMilestone) {
      // Promotion detection
      if (jobTitle && jobTitle !== oldJobTitle) {
        await ctx.db.jobRecord.create({
          data: {
            employeeId: id,
            type: 'PROMOTION',
            effectiveDate: new Date(),
            title: 'Promotion',
            description: `Promoted to ${jobTitle}`,
            metadata: JSON.stringify({ from: oldJobTitle, to: jobTitle }),
          }
        });
      }

      // Dept change detection
      if (department && department !== current.departmentId) {
        await ctx.db.jobRecord.create({
          data: {
            employeeId: id,
            type: 'DEPT_CHANGE',
            effectiveDate: new Date(),
            title: 'Department Change',
            description: `Moved to ${updated.department?.name || 'New Department'}`,
            metadata: JSON.stringify({ from: current.department?.name, to: updated.department?.name }),
          }
        });
      }

      // Manager change detection
      if (manager && manager !== current.managerId) {
        await ctx.db.jobRecord.create({
          data: {
            employeeId: id,
            type: 'MANAGER_CHANGE',
            effectiveDate: new Date(),
            title: 'TL Change',
            description: `TL changed to ${updated.manager?.firstName} ${updated.manager?.lastName}`,
            metadata: JSON.stringify({ from: current.managerId, to: manager }),
          }
        });
      }
    }

    // Notify the employee about profile changes (department, manager, status)
    const changedFields: string[] = [];
    if (department && department !== current.departmentId) changedFields.push('department');
    if (manager && manager !== current.managerId) changedFields.push('manager');
    if (updateData.status && updateData.status !== current.status) changedFields.push('status');

    if (changedFields.length > 0 && id !== ctx.user.employeeId) {
      await notifyService.send({
        companyId: ctx.user.companyId,
        recipients: [id],
        eventType: 'EMPLOYEE_UPDATED',
        title: 'Your profile has been updated',
        message: `The following fields were changed: ${changedFields.join(', ')}.`,
        linkUrl: `/people/${id}`,
      });
    }

    return updated;
  }),

  updatePersonalInfo: protectedProcedure.input(z.object({
    id: z.string(),
    employeeNumber: z.string().optional(),
    middleName: z.string().optional(),
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    personalEmail: z.string().optional(),
    allergies: z.string().optional(),
    shirtSize: z.string().optional(),
    nationality: z.string().optional(),
    nationalId: z.string().optional(),
    passportNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    stateProvince: z.string().optional(),
    country: z.string().optional(),
    zipCode: z.string().optional(),
    addressNotes: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactRelationship: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    bankName: z.string().optional(),
    bankBranch: z.string().optional(),
    bankAccount: z.string().optional(),
    bankAccountName: z.string().optional(),
    bankApprovalDoc: z.string().optional(),
    documents: z.string().optional(),
    cv: z.string().optional(),
    cvOld: z.string().optional(),
    familyDetails: z.any().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;
    const current = await ctx.db.employee.findUnique({ where: { id } });
    if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (current.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
    const isSelf = ctx.user.employeeId === id;
    const isAdminRole = ['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATOR'].includes(ctx.user.role);
    if (!isSelf && !isAdminRole) throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only edit your own profile' });
    const currentPersonalInfo = decryptPersonalInfo(JSON.parse(current.personalInfo || '{}'));
    const merged = encryptPersonalInfo({ ...currentPersonalInfo, ...fields });
    const updated = await ctx.db.employee.update({
      where: { id },
      data: { personalInfo: JSON.stringify(merged) },
    });
    return updated;
  }),

  updateWorkInfo: protectedProcedure.input(z.object({
    id: z.string(),
    jobTitle: z.string().optional(),
    jobPercentage: z.string().optional(),
    assetBudget: z.string().optional(),
    assetBudgetCurrency: z.string().optional(),
    reportsTo: z.string().optional(),
    office: z.string().optional(),
    team: z.string().optional(),
    hrContact: z.string().optional(),
    bootcampNo: z.string().optional(),
    mindspaceCardNo: z.string().optional(),
    terminationDate: z.string().optional(),
    terminationReason: z.string().optional(),
    contractType: z.string().optional(),
    salaryType: z.string().optional(),
    salaryAmount: z.string().optional(),
    salaryCurrency: z.string().optional(),
    compensationNote: z.string().optional(),
    contractDocuments: z.string().optional(),
    assets: z.any().optional(),
    salaryHistory: z.any().optional(),
    certifications: z.any().optional(),
    pensionFundName: z.string().optional(),
    pensionEmployeeContribution: z.string().optional(),
    pensionEmployerContribution: z.string().optional(),
    pensionStartDate: z.string().optional(),
    pensionId: z.string().optional(),
    pensionDoc: z.string().optional(),
    trainingFundName: z.string().optional(),
    trainingFundEmployeeContribution: z.string().optional(),
    trainingFundEmployerContribution: z.string().optional(),
    trainingFundStartDate: z.string().optional(),
    trainingFundId: z.string().optional(),
    trainingFundDoc: z.string().optional(),
    workerType: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;
    const current = await ctx.db.employee.findUnique({ where: { id } });
    if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (current.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
    const isSelf = ctx.user.employeeId === id;
    const isAdminRole = ['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATOR'].includes(ctx.user.role);
    if (!isSelf && !isAdminRole) throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only edit your own profile' });
    // Salary fields are admin-only — strip them for self-edit
    const ADMIN_ONLY_FIELDS = ['salaryAmount', 'salaryCurrency', 'salaryHistory', 'salaryType', 'contractType', 'assetBudget', 'assetBudgetCurrency', 'terminationDate', 'terminationReason'];
    if (isSelf && !isAdminRole) {
      for (const f of ADMIN_ONLY_FIELDS) delete (fields as any)[f];
    }
    const currentWorkInfo = JSON.parse(current.workInfo || '{}');
    const updated = await ctx.db.employee.update({
      where: { id },
      data: { workInfo: JSON.stringify({ ...currentWorkInfo, ...fields }) },
    });
    return updated;
  }),

  terminate: protectedProcedure.input(terminateEmployeeSchema).mutation(async ({ ctx, input }) => {
    const employee = await ctx.db.employee.findUnique({ where: { id: input.id } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to terminate this employee' });
    const currentWorkInfo = JSON.parse(employee.workInfo || '{}');
    if (input.reason) {
      currentWorkInfo.terminationReason = input.reason;
    }
    const terminated = await ctx.db.employee.update({
      where: { id: input.id },
      data: {
        status: 'TERMINATED',
        endDate: input.endDate,
        workInfo: JSON.stringify(currentWorkInfo),
      },
      include: { company: true },
    });
    return terminated;
  }),

  // Update employee's system role (SUPER_ADMIN/ADMIN only)
  updateRole: protectedProcedure
    .input(z.object({ employeeId: z.string(), role: z.enum(['EMPLOYEE', 'IT', 'OPERATOR', 'ADMIN', 'SUPER_ADMIN']) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'SUPER_ADMIN' && ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OPERATOR') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can change roles' });
      }
      const employee = await ctx.db.employee.findFirst({ where: { id: input.employeeId, companyId: ctx.user.companyId } });
      if (!employee) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.user.updateMany({
        where: { employeeId: input.employeeId },
        data: { role: input.role },
      });
      return { success: true };
    }),

  getOrgChartData: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.employee.findMany({
      where: { 
        companyId: ctx.user.companyId,
        status: 'ACTIVE'
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        managerId: true,
        workInfo: true,
        status: true,
        department: { select: { id: true, name: true } },
        _count: { select: { directReports: true } },
      },
    });
  }),

  getTimeline: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const employee = await ctx.db.employee.findUnique({
      where: { id: input.id },
      select: { id: true, companyId: true, managerId: true },
    });

    if (!employee) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    }

    if (employee.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this employee' });
    }

    const isSelf = ctx.user.employeeId === employee.id;
    const isManager = ctx.user.employeeId === employee.managerId;
    const isHrOrAdmin = ctx.user.role === 'HR' || ctx.user.role === 'ADMIN' || ctx.user.role === 'OPERATOR';
    const canSeeSensitive = isSelf || isManager || isHrOrAdmin;

    const [jobRecords, compensationRecords] = await Promise.all([
      ctx.db.jobRecord.findMany({
        where: { employeeId: employee.id },
        orderBy: { effectiveDate: 'desc' },
      }),
      canSeeSensitive 
        ? ctx.db.compensationRecord.findMany({
            where: { employeeId: employee.id },
            orderBy: { effectiveDate: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const timeline: any[] = [
      ...jobRecords.map((record) => ({
        id: record.id,
        type: record.type,
        date: record.effectiveDate,
        title: record.title,
        description: record.description,
        isSensitive: false,
        metadata: JSON.parse(record.metadata || '{}'),
      })),
      ...compensationRecords.map((record) => ({
        id: record.id,
        type: 'COMPENSATION',
        date: record.effectiveDate,
        title: `${record.type.replace('_', ' ')}: ${record.salary || record.bonusAmount || record.equityAmount} ${record.currency}`,
        description: record.changeReason,
        isSensitive: true,
        metadata: {
          amount: record.salary || record.bonusAmount || record.equityAmount,
          currency: record.currency,
          type: record.type,
        },
      })),
    ];

    return timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
  }),

  // Employee's assigned IT assets (visible to self + IT/Admin)
  getEmployeeAssets: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isSelfOrIt = input.employeeId === ctx.user.employeeId || ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'IT'].includes(ctx.user.role);
      if (!isSelfOrIt) throw new TRPCError({ code: 'FORBIDDEN' });
      return ctx.db.iTAsset.findMany({
        where: { assigneeId: input.employeeId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Employee's assigned licenses (visible to self + IT/Admin)
  getEmployeeLicenses: protectedProcedure
    .input(z.object({ employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isSelfOrIt = input.employeeId === ctx.user.employeeId || ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'IT'].includes(ctx.user.role);
      if (!isSelfOrIt) throw new TRPCError({ code: 'FORBIDDEN' });
      return ctx.db.iTLicenseAssignment.findMany({
        where: { employeeId: input.employeeId },
        include: {
          license: true,
        },
        orderBy: { assignedAt: 'desc' },
      });
    }),

  // Live exchange rates (ECB via frankfurter.app, cached 24h server-side)
  getExchangeRates: protectedProcedure.query(async () => {
    return getExchangeRates();
  }),

});
