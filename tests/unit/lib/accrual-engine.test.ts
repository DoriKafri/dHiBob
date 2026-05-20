import { describe, it, expect } from 'vitest';
import { calculateBalance } from '../../../src/lib/accrual-engine';
import { parseISO } from 'date-fns';

describe('accrual-engine', () => {
  describe('calculateBalance', () => {
    it('Test 1: Full year accrual - Employee started before the current year', () => {
      // Starting date: Jan 1st of previous year (2025-01-01)
      // Calculation date: Dec 31st of current year (2026-12-31)
      // Accrual rate: 1.5 days/month
      // Full months in 2026: 12
      // Accrued: 12 * 1.5 = 18.0
      const result = calculateBalance({
        employeeStartDate: parseISO('2025-01-01'),
        policyAccrualRate: 1.5,
        policyMaxCarryOver: 10,
        approvedRequests: [],
        calculationDate: parseISO('2026-12-31'),
        carryover: 0
      });
      expect(result.available).toBe(18.0);
    });

    it('Test 2: Pro-rated accrual for mid-year hire', () => {
      const result = calculateBalance({
        employeeStartDate: parseISO('2026-07-01'),
        policyAccrualRate: 2.0,
        policyMaxCarryOver: 10,
        approvedRequests: [],
        calculationDate: parseISO('2026-12-31'),
        carryover: 0
      });
      expect(result.available).toBe(12.0);
    });

    it('Test 3: Capped carryover', () => {
      const result = calculateBalance({
        employeeStartDate: parseISO('2025-01-01'),
        policyAccrualRate: 1.5,
        policyMaxCarryOver: 5,
        approvedRequests: [],
        calculationDate: parseISO('2026-01-01'),
        carryover: 10
      });
      expect(result.available).toBe(5);
    });

    it('should deduct approved requests within the current period', () => {
      const result = calculateBalance({
        employeeStartDate: parseISO('2025-01-01'),
        policyAccrualRate: 2.0,
        policyMaxCarryOver: 10,
        approvedRequests: [
          { days: 3, startDate: parseISO('2026-03-15'), status: 'APPROVED' },
          { days: 2, startDate: parseISO('2026-04-10'), status: 'APPROVED' }
        ],
        calculationDate: parseISO('2026-06-01'),
        carryover: 0
      });
      expect(result.available).toBe(5.0);
    });
  });
});
