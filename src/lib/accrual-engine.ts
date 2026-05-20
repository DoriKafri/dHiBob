import { 
  startOfYear, 
  differenceInMonths, 
  max, 
  isAfter, 
  isBefore, 
  startOfDay, 
  addDays,
  endOfDay
} from 'date-fns';

interface ApprovedRequest {
  days: number;
  startDate: Date;
  status: string;
}

interface CalculateBalanceParams {
  employeeStartDate: Date;
  policyAccrualRate: number;
  policyMaxCarryOver: number;
  approvedRequests: ApprovedRequest[];
  calculationDate: Date;
  carryover?: number;
}

export interface BalanceBreakdown {
  accrued: number;
  used: number;
  carryover: number;
  available: number;
}

/**
 * Calculates the available time off balance for an employee.
 * 
 * Logic:
 * 1. Determine the start of the current accrual period (Jan 1st of current year or employeeStartDate).
 * 2. Calculate full months elapsed between period start and calculationDate.
 * 3. accrued = monthsElapsed * policyAccrualRate
 * 4. used = sum of days in approvedRequests within the current period.
 * 5. carryover = min(inputCarryover, policyMaxCarryOver)
 * 6. available = accrued + carryover - used
 */
export function calculateBalance({
  employeeStartDate,
  policyAccrualRate,
  policyMaxCarryOver,
  approvedRequests,
  calculationDate,
  carryover: inputCarryover = 0
}: CalculateBalanceParams): BalanceBreakdown {
  const currentYearStart = startOfYear(calculationDate);
  const periodStart = max([startOfDay(employeeStartDate), currentYearStart]);
  
  const monthsElapsed = differenceInMonths(addDays(endOfDay(calculationDate), 1), periodStart);
  
  const accrued = monthsElapsed * policyAccrualRate;
  
  const used = approvedRequests
    .filter(req => 
      req.status === 'APPROVED' && 
      (isAfter(req.startDate, periodStart) || req.startDate.getTime() === periodStart.getTime()) &&
      (isBefore(req.startDate, calculationDate) || req.startDate.getTime() === calculationDate.getTime())
    )
    .reduce((sum, req) => sum + req.days, 0);
    
  const carryover = Math.min(inputCarryover, policyMaxCarryOver);
  
  const available = accrued + carryover - used;
  
  return {
    accrued: parseFloat(accrued.toFixed(3)),
    used: parseFloat(used.toFixed(3)),
    carryover: parseFloat(carryover.toFixed(3)),
    available: parseFloat(available.toFixed(3)),
  };
}
