import { CompensationRecord, SalaryBand } from '@prisma/client';

export function getCurrentSalary(events: CompensationRecord[], asOfDate: Date = new Date()): number {
  const approvedSalaries = events.filter(e => 
    e.type === 'BASE_SALARY' && 
    e.status === 'APPROVED' && 
    e.effectiveDate <= asOfDate &&
    e.salary !== null
  );

  if (approvedSalaries.length === 0) return 0;

  // Sort descending by effective date
  approvedSalaries.sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
  
  return approvedSalaries[0].salary || 0;
}

export function calculateCompaRatio(currentSalary: number, band: SalaryBand | null): number {
  if (!band || band.midSalary === 0 || currentSalary === 0) return 0;
  return Number((currentSalary / band.midSalary).toFixed(2));
}
