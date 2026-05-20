import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, hrProtectedProcedure, salaryProtectedProcedure } from '@/server/trpc';
import { getExchangeRates, convertCurrency } from '@/lib/currency';

const headcountQuerySchema = z.object({
  groupBy: z.enum(['department', 'site', 'employmentType']).default('department'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
const attritionQuerySchema = z.object({
  startDate: z.coerce.date(), endDate: z.coerce.date(),
  groupBy: z.enum(['department', 'site']).default('department'),
});
const diversityQuerySchema = z.object({ year: z.number().optional() });
const headcountOverTimeQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
const timeToHireQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// Month iterator helper for time-series procedures
function* monthRange(start: Date, end: Date): Generator<{
  year: number; month: number; label: string; monthStart: Date; monthEnd: Date
}> {
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const finish = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= finish) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
    yield {
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      label: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      monthStart,
      monthEnd,
    };
    cur.setMonth(cur.getMonth() + 1);
  }
}

export const analyticsRouter = router({
  headcount: hrProtectedProcedure.input(headcountQuerySchema).query(async ({ ctx, input }) => {
    const { groupBy, startDate, endDate } = input;
    let where: Record<string, unknown> = { companyId: ctx.user.companyId, status: 'ACTIVE' };
    if (startDate && endDate) {
      where.startDate = { lte: endDate };
      where.OR = [{ endDate: null }, { endDate: { gte: startDate } }];
    }
    const employees = await ctx.db.employee.findMany({
      where,
      include: {
        department: { select: { name: true } },
        site: { select: { name: true } },
      },
    });

    // Compute avgTenureMonths from employee startDates
    let avgTenureMonths = 0;
    if (employees.length > 0) {
      const now = new Date();
      const totalMonths = employees.reduce((sum: number, emp: { startDate: Date }) => {
        const months = (now.getTime() - new Date(emp.startDate).getTime()) / (1000 * 60 * 60 * 24 * (365.25 / 12));
        return sum + months;
      }, 0);
      avgTenureMonths = parseFloat((totalMonths / employees.length).toFixed(1));
    }

    let groupedData: Record<string, number> = {};
    if (groupBy === 'department') {
      groupedData = employees.reduce((acc: Record<string, number>, emp: { department?: { name: string } | null }) => {
        const key = emp.department?.name ?? 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    } else if (groupBy === 'site') {
      groupedData = employees.reduce((acc: Record<string, number>, emp: { site?: { name: string } | null }) => {
        const key = emp.site?.name ?? 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    } else if (groupBy === 'employmentType') {
      groupedData = employees.reduce((acc: Record<string, number>, emp: { employmentType: string }) => {
        const key = emp.employmentType;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    }
    return {
      total: employees.length,
      grouped: Object.entries(groupedData).map(([key, count]) => ({ key, count })),
      groupBy,
      avgTenureMonths,
    };
  }),

  attrition: hrProtectedProcedure.input(attritionQuerySchema).query(async ({ ctx, input }) => {
    const { startDate, endDate, groupBy } = input;
    const terminatedEmployees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'TERMINATED', endDate: { gte: startDate, lte: endDate } },
      include: {
        department: { select: { name: true } },
        site: { select: { name: true } },
      },
    });
    const allEmployees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId },
      include: {
        department: { select: { name: true } },
        site: { select: { name: true } },
      },
    });
    const activeEmployee = allEmployees.filter((emp: { startDate: Date; endDate: Date | null }) => {
      const empStart = emp.startDate;
      const empEnd = emp.endDate;
      return empStart <= endDate && (!empEnd || empEnd >= startDate);
    });

    let groupedTerminations: Record<string, number> = {};
    let groupedHeadcount: Record<string, number> = {};
    if (groupBy === 'department') {
      groupedTerminations = terminatedEmployees.reduce((acc: Record<string, number>, emp: { department?: { name: string } | null }) => {
        const key = emp.department?.name ?? 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      groupedHeadcount = activeEmployee.reduce((acc: Record<string, number>, emp: { department?: { name: string } | null }) => {
        const key = emp.department?.name ?? 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    } else if (groupBy === 'site') {
      groupedTerminations = terminatedEmployees.reduce((acc: Record<string, number>, emp: { site?: { name: string } | null }) => {
        const key = emp.site?.name ?? 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      groupedHeadcount = activeEmployee.reduce((acc: Record<string, number>, emp: { site?: { name: string } | null }) => {
        const key = emp.site?.name ?? 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    }
    const attritionByGroup = Object.entries(groupedTerminations).map(([key, terminations]) => {
      const headcount = groupedHeadcount[key] || 0;
      const rate = headcount > 0 ? (terminations / headcount) * 100 : 0;
      return { key, terminations, headcount, attritionRate: parseFloat(rate.toFixed(2)) };
    });
    const totalTerminations = terminatedEmployees.length;
    const totalHeadcount = activeEmployee.length;
    const overallAttritionRate = totalHeadcount > 0 ? parseFloat(((totalTerminations / totalHeadcount) * 100).toFixed(2)) : 0;
    return {
      period: { startDate, endDate },
      overall: { terminations: totalTerminations, headcount: totalHeadcount, attritionRate: overallAttritionRate },
      byGroup: attritionByGroup, groupBy,
    };
  }),

  diversity: hrProtectedProcedure.input(diversityQuerySchema).query(async ({ ctx, input }) => {
    const year = input.year || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const employees = await ctx.db.employee.findMany({
      where: {
        companyId: ctx.user.companyId,
        startDate: { lte: yearEnd },
        OR: [{ endDate: null }, { endDate: { gte: yearStart } }],
      },
      include: {
        department: { select: { name: true } },
      },
    });

    const departmentGroups = employees.reduce((acc: Record<string, { total: number; employmentTypes: Record<string, number> }>, emp: { department?: { name: string } | null; employmentType: string }) => {
      const dept = emp.department?.name ?? 'Unassigned';
      if (!acc[dept]) acc[dept] = { total: 0, employmentTypes: {} };
      acc[dept].total += 1;
      acc[dept].employmentTypes[emp.employmentType] = (acc[dept].employmentTypes[emp.employmentType] || 0) + 1;
      return acc;
    }, {});

    const newHires = employees.filter((emp: { startDate: Date }) => new Date(emp.startDate) >= yearStart).length;

    return {
      year,
      totalEmployees: employees.length,
      byDepartment: departmentGroups,
      leadership: null,
      gender: null,
      newHires,
    };
  }),

  headcountOverTime: hrProtectedProcedure.input(headcountOverTimeQuerySchema).query(async ({ ctx, input }) => {
    const { startDate, endDate } = input;

    // Guard: reject ranges exceeding 24 months
    const diffMonths =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());
    if (diffMonths > 24) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Date range must not exceed 24 months',
      });
    }

    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId },
      select: { id: true, startDate: true, endDate: true },
    });

    const result: Array<{ month: string; count: number }> = [];
    for (const { label, monthStart, monthEnd } of monthRange(startDate, endDate)) {
      const count = employees.filter((emp: { startDate: Date; endDate: Date | null }) => {
        const empStart = new Date(emp.startDate);
        const empEnd = emp.endDate ? new Date(emp.endDate) : null;
        return empStart <= monthEnd && (!empEnd || empEnd >= monthStart);
      }).length;
      result.push({ month: label, count });
    }
    return result;
  }),

  // Average salary by department / position
  salaryByDepartment: salaryProtectedProcedure.query(async ({ ctx }) => {
    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      select: { workInfo: true, department: { select: { name: true } } },
    });

    // Fetch live exchange rates so mixed-currency salaries are comparable
    const rates = await getExchangeRates();

    const deptSalaries: Record<string, { total: number; count: number }> = {};
    const positionSalaries: Record<string, { total: number; count: number }> = {};

    for (const emp of employees) {
      let wi: any = {};
      try { wi = JSON.parse((emp as any).workInfo || '{}'); } catch {}
      const history = Array.isArray(wi.salaryHistory) ? wi.salaryHistory : [];
      const now = new Date();
      const past = history
        .filter((e: any) => e.effectiveDate && new Date(e.effectiveDate) <= now)
        .sort((a: any, b: any) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
      const rawSalary = parseFloat(past[0]?.salaryAmount || '0') || 0;
      if (rawSalary === 0) continue;

      // Convert to USD for consistent averaging across currencies
      const currency = past[0]?.salaryCurrency || 'USD';
      const salary = convertCurrency(rawSalary, currency, 'USD', rates);

      const dept = (emp as any).department?.name ?? 'Unassigned';
      if (!deptSalaries[dept]) deptSalaries[dept] = { total: 0, count: 0 };
      deptSalaries[dept].total += salary;
      deptSalaries[dept].count += 1;

      const position = wi.jobTitle || 'Unknown';
      if (!positionSalaries[position]) positionSalaries[position] = { total: 0, count: 0 };
      positionSalaries[position].total += salary;
      positionSalaries[position].count += 1;
    }

    return {
      byDepartment: Object.entries(deptSalaries)
        .map(([key, v]) => ({ key, avgSalary: Math.round(v.total / v.count), count: v.count }))
        .sort((a, b) => b.avgSalary - a.avgSalary),
      byPosition: Object.entries(positionSalaries)
        .map(([key, v]) => ({ key, avgSalary: Math.round(v.total / v.count), count: v.count }))
        .sort((a, b) => b.avgSalary - a.avgSalary),
      baseCurrency: 'USD',
    };
  }),

  // Future cost forecast (salary increases over next 12 months)
  futureCostForecast: salaryProtectedProcedure.query(async ({ ctx }) => {
    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      select: { workInfo: true, department: { select: { name: true } } },
    });

    const rates = await getExchangeRates();
    const now = new Date();
    const monthMap: Record<string, { currentCost: number; futureCost: number }> = {};

    // Initialize next 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[label] = { currentCost: 0, futureCost: 0 };
    }

    for (const emp of employees) {
      let wi: any = {};
      try { wi = JSON.parse((emp as any).workInfo || '{}'); } catch {}
      const history: any[] = Array.isArray(wi.salaryHistory) ? wi.salaryHistory : [];
      if (history.length === 0) continue;

      const sorted = history
        .filter((e: any) => e.effectiveDate)
        .sort((a: any, b: any) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());

      for (const label of Object.keys(monthMap)) {
        const [yr, mo] = label.split('-').map(Number);
        const monthEnd = new Date(yr, mo, 0);
        const applicable = sorted.filter((e: any) => new Date(e.effectiveDate) <= monthEnd);
        if (applicable.length === 0) continue;
        const entry = applicable[applicable.length - 1];
        const rawSal = parseFloat(entry.salaryAmount || '0') || 0;
        const sal = convertCurrency(rawSal, entry.salaryCurrency || 'USD', 'USD', rates);
        monthMap[label].futureCost += sal;
      }
    }

    // Current total cost (first month)
    const labels = Object.keys(monthMap).sort();
    if (labels.length > 0) {
      for (const label of labels) {
        monthMap[label].currentCost = monthMap[labels[0]].futureCost;
      }
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));
  }),

  // Gender distribution
  genderDistribution: hrProtectedProcedure.query(async ({ ctx }) => {
    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      select: { personalInfo: true, department: { select: { name: true } } },
    });

    const genderCounts: Record<string, number> = {};
    const byDept: Record<string, Record<string, number>> = {};

    for (const emp of employees) {
      let pi: any = {};
      try { pi = JSON.parse((emp as any).personalInfo || '{}'); } catch {}
      const gender = pi.gender || 'Not specified';
      genderCounts[gender] = (genderCounts[gender] || 0) + 1;

      const dept = (emp as any).department?.name ?? 'Unassigned';
      if (!byDept[dept]) byDept[dept] = {};
      byDept[dept][gender] = (byDept[dept][gender] || 0) + 1;
    }

    return {
      overall: Object.entries(genderCounts).map(([gender, count]) => ({ gender, count })),
      byDepartment: Object.entries(byDept).map(([dept, genders]) => ({
        department: dept,
        ...genders,
      })),
      total: employees.length,
    };
  }),

  // Age distribution
  ageDistribution: hrProtectedProcedure.query(async ({ ctx }) => {
    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      select: { personalInfo: true },
    });

    const now = new Date();
    const ageBuckets: Record<string, number> = { 'Under 25': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
    let totalAge = 0;
    let ageCount = 0;

    for (const emp of employees) {
      let pi: any = {};
      try { pi = JSON.parse((emp as any).personalInfo || '{}'); } catch {}
      if (!pi.dateOfBirth) continue;

      const dob = new Date(pi.dateOfBirth);
      if (isNaN(dob.getTime())) continue;

      const age = Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      totalAge += age;
      ageCount += 1;

      if (age < 25) ageBuckets['Under 25'] += 1;
      else if (age < 35) ageBuckets['25-34'] += 1;
      else if (age < 45) ageBuckets['35-44'] += 1;
      else if (age < 55) ageBuckets['45-54'] += 1;
      else ageBuckets['55+'] += 1;
    }

    return {
      buckets: Object.entries(ageBuckets).map(([range, count]) => ({ range, count })),
      averageAge: ageCount > 0 ? parseFloat((totalAge / ageCount).toFixed(1)) : null,
      totalWithDob: ageCount,
    };
  }),

  // Simple turnover by department — no date input, computes last 12 months server-side
  turnoverByDepartment: hrProtectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const terminated = await ctx.db.employee.findMany({
      where: {
        companyId: ctx.user.companyId,
        status: 'TERMINATED',
        endDate: { gte: twelveMonthsAgo, lte: now },
      },
      include: { department: { select: { name: true } } },
    });

    const active = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      include: { department: { select: { name: true } } },
    });

    // Count terminated per dept
    const termByDept: Record<string, number> = {};
    for (const emp of terminated) {
      const dept = (emp as any).department?.name ?? 'Unassigned';
      termByDept[dept] = (termByDept[dept] || 0) + 1;
    }

    // Count active per dept
    const activeByDept: Record<string, number> = {};
    for (const emp of active) {
      const dept = (emp as any).department?.name ?? 'Unassigned';
      activeByDept[dept] = (activeByDept[dept] || 0) + 1;
    }

    // All departments
    const allDepts = new Set([...Object.keys(termByDept), ...Object.keys(activeByDept)]);
    const result = Array.from(allDepts).map(dept => {
      const terminations = termByDept[dept] || 0;
      const headcount = (activeByDept[dept] || 0) + terminations;
      const rate = headcount > 0 ? parseFloat(((terminations / headcount) * 100).toFixed(1)) : 0;
      return { department: dept, terminations, headcount, turnoverRate: rate };
    }).filter(d => d.terminations > 0).sort((a, b) => b.turnoverRate - a.turnoverRate);

    return { data: result, totalTerminated: terminated.length, period: '12 months' };
  }),

  // Simple headcount over time — no date input, computes last 12 months server-side
  headcountTimeline: hrProtectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId },
      select: { startDate: true, endDate: true, status: true },
    });

    const months: Array<{ month: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const count = employees.filter((emp: any) => {
        const empStart = new Date(emp.startDate);
        const empEnd = emp.endDate ? new Date(emp.endDate) : null;
        return empStart <= monthEnd && (!empEnd || empEnd >= d);
      }).length;

      months.push({ month: label, count });
    }

    return months;
  }),

  timeToHire: hrProtectedProcedure.input(timeToHireQuerySchema).query(async ({ ctx, input }) => {
    const { startDate, endDate } = input;

    const candidates = await ctx.db.candidate.findMany({
      where: {
        stage: 'HIRED',
        updatedAt: { gte: startDate, lte: endDate },
        job: { companyId: ctx.user.companyId },
      },
      include: { job: { select: { companyId: true } } },
    });

    // Group by month of updatedAt
    const monthMap: Record<string, { totalDays: number; count: number }> = {};
    const msPerDay = 1000 * 60 * 60 * 24;

    for (const candidate of candidates) {
      const hiredAt = new Date(candidate.updatedAt);
      const label = `${hiredAt.getFullYear()}-${String(hiredAt.getMonth() + 1).padStart(2, '0')}`;
      const daysDiff = (hiredAt.getTime() - new Date(candidate.createdAt).getTime()) / msPerDay;
      if (!monthMap[label]) monthMap[label] = { totalDays: 0, count: 0 };
      monthMap[label].totalDays += daysDiff;
      monthMap[label].count += 1;
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { totalDays, count }]) => ({
        month,
        avgDays: parseFloat((totalDays / count).toFixed(1)),
        hires: count,
      }));
  }),
});
