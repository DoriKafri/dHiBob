import { router, salaryProtectedProcedure } from '../trpc';
import { getCurrentSalary, calculateCompaRatio } from '@/lib/compensation-engine';

export const compensationRouter = router({
  getStats: salaryProtectedProcedure.query(async ({ ctx }) => {
    const employees = await ctx.db.employee.findMany({
      where: { companyId: ctx.user.companyId, status: 'ACTIVE' },
      include: { compensationHistory: true }
    });

    let totalSalary = 0;
    let totalCompaRatio = 0;
    let employeesWithSalary = 0;

    for (const emp of employees) {
      const salary = getCurrentSalary(emp.compensationHistory);
      if (salary > 0) {
        totalSalary += salary;
        // In a real app, we'd fetch the actual band for the employee's level/jobFamily
        // Mocking a band for MVP stats calculation
        const compaRatio = calculateCompaRatio(salary, { midSalary: 100000 } as any);
        totalCompaRatio += compaRatio;
        employeesWithSalary++;
      }
    }

    const avgSalary = employeesWithSalary > 0 ? totalSalary / employeesWithSalary : 0;
    const avgCompaRatio = employeesWithSalary > 0 ? totalCompaRatio / employeesWithSalary : 0;

    return {
      avgSalary,
      avgCompaRatio: Number(avgCompaRatio.toFixed(2)),
      budgetUsed: 87, // Mock for MVP
      equityGrants: 42, // Mock for MVP
      employeesWithSalary,
    };
  }),
});