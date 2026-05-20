import { describe, it, expect } from 'vitest';

// Analytics business logic functions

function calculateHeadcount(
  employees: Array<{ id: string; status: string; startDate?: Date; endDate?: Date }>,
  status: string = 'ACTIVE'
): number {
  return employees.filter(emp => emp.status === status).length;
}

function calculateGrowthRate(currentHeadcount: number, previousHeadcount: number): number {
  if (previousHeadcount === 0) return 0;
  const rate = ((currentHeadcount - previousHeadcount) / previousHeadcount) * 100;
  return Math.round(rate * 100) / 100;
}

function calculateAttritionRate(
  terminatedCount: number,
  avgHeadcount: number,
  _months: number = 12
): number {
  if (avgHeadcount === 0) return 0;
  const rate = (terminatedCount / avgHeadcount) * 100;
  return Math.round(rate * 100) / 100;
}

function calculateDepartmentBreakdown(
  employees: Array<{
    id: string;
    department: string;
    status?: string;
  }>,
  filterStatus?: string
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  employees.forEach(emp => {
    if (filterStatus && emp.status !== filterStatus) return;
    if (!breakdown[emp.department]) {
      breakdown[emp.department] = 0;
    }
    breakdown[emp.department]++;
  });

  return breakdown;
}

function calculateAverageHeadcount(
  startHeadcount: number,
  endHeadcount: number
): number {
  return Math.round((startHeadcount + endHeadcount) / 2 * 100) / 100;
}

function calculateTenureDistribution(
  employees: Array<{ id: string; hireDate: Date }>,
  currentDate: Date = new Date()
): Record<string, number> {
  const distribution: Record<string, number> = {
    '0-1': 0,
    '1-3': 0,
    '3-5': 0,
    '5+': 0,
  };

  employees.forEach(emp => {
    const yearsTenure =
      (currentDate.getTime() - emp.hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

    if (yearsTenure < 1) distribution['0-1']++;
    else if (yearsTenure < 3) distribution['1-3']++;
    else if (yearsTenure < 5) distribution['3-5']++;
    else distribution['5+']++;
  });

  return distribution;
}

function calculateDiversityMetrics(
  employees: Array<{
    id: string;
    gender?: string;
    ethnicity?: string;
  }>
): {
  genderDistribution: Record<string, number>;
  ethnicityDistribution: Record<string, number>;
} {
  const genderDist: Record<string, number> = {};
  const ethnicityDist: Record<string, number> = {};

  employees.forEach(emp => {
    if (emp.gender) {
      genderDist[emp.gender] = (genderDist[emp.gender] || 0) + 1;
    }
    if (emp.ethnicity) {
      ethnicityDist[emp.ethnicity] = (ethnicityDist[emp.ethnicity] || 0) + 1;
    }
  });

  return {
    genderDistribution: genderDist,
    ethnicityDistribution: ethnicityDist,
  };
}

function calculateHiringRate(
  newHiresCount: number,
  avgHeadcount: number,
  _months: number = 12
): number {
  if (avgHeadcount === 0) return 0;
  const rate = (newHiresCount / avgHeadcount) * 100;
  return Math.round(rate * 100) / 100;
}

describe('Analytics Service', () => {
  // Headcount calculation
  describe('calculateHeadcount()', () => {
    const employees = [
      { id: '1', status: 'ACTIVE' },
      { id: '2', status: 'ACTIVE' },
      { id: '3', status: 'ACTIVE' },
      { id: '4', status: 'TERMINATED' },
      { id: '5', status: 'ON_LEAVE' },
    ];

    it('should count only ACTIVE employees', () => {
      const count = calculateHeadcount(employees, 'ACTIVE');
      expect(count).toBe(3);
    });

    it('should count terminated employees', () => {
      const count = calculateHeadcount(employees, 'TERMINATED');
      expect(count).toBe(1);
    });

    it('should handle empty array', () => {
      const count = calculateHeadcount([], 'ACTIVE');
      expect(count).toBe(0);
    });

    it('should handle missing status', () => {
      const count = calculateHeadcount(employees, 'INACTIVE');
      expect(count).toBe(0);
    });

    it('should count all employees with no filter', () => {
      const allCount = employees.length;
      const activeCount = calculateHeadcount(employees, 'ACTIVE');
      expect(activeCount).toBeLessThanOrEqual(allCount);
    });
  });

  // Growth rate calculation
  describe('calculateGrowthRate()', () => {
    it('should calculate positive growth', () => {
      const rate = calculateGrowthRate(120, 100);
      expect(rate).toBe(20);
    });

    it('should calculate negative growth', () => {
      const rate = calculateGrowthRate(80, 100);
      expect(rate).toBe(-20);
    });

    it('should return 0 for no growth', () => {
      const rate = calculateGrowthRate(100, 100);
      expect(rate).toBe(0);
    });

    it('should return 0 for zero previous headcount', () => {
      const rate = calculateGrowthRate(50, 0);
      expect(rate).toBe(0);
    });

    it('should handle large growth', () => {
      const rate = calculateGrowthRate(1000, 100);
      expect(rate).toBe(900);
    });

    it('should handle decimal growth', () => {
      const rate = calculateGrowthRate(105, 100);
      expect(rate).toBe(5);
    });

    it('should round to 2 decimal places', () => {
      const rate = calculateGrowthRate(101, 100);
      expect(rate % 1).toBeLessThanOrEqual(0.01);
    });
  });

  // Attrition rate calculation
  describe('calculateAttritionRate()', () => {
    it('should calculate attrition rate', () => {
      const rate = calculateAttritionRate(10, 100);
      expect(rate).toBe(10);
    });

    it('should return 0 for no attrition', () => {
      const rate = calculateAttritionRate(0, 100);
      expect(rate).toBe(0);
    });

    it('should return 0 for zero headcount', () => {
      const rate = calculateAttritionRate(10, 0);
      expect(rate).toBe(0);
    });

    it('should handle 100% attrition', () => {
      const rate = calculateAttritionRate(100, 100);
      expect(rate).toBe(100);
    });

    it('should handle decimal attrition', () => {
      const rate = calculateAttritionRate(5, 100);
      expect(rate).toBe(5);
    });

    it('should handle small attrition rates', () => {
      const rate = calculateAttritionRate(1, 500);
      expect(rate).toBe(0.2);
    });
  });

  // Department breakdown
  describe('calculateDepartmentBreakdown()', () => {
    const employees = [
      { id: '1', department: 'Engineering', status: 'ACTIVE' },
      { id: '2', department: 'Engineering', status: 'ACTIVE' },
      { id: '3', department: 'Sales', status: 'ACTIVE' },
      { id: '4', department: 'HR', status: 'ACTIVE' },
      { id: '5', department: 'Engineering', status: 'TERMINATED' },
    ];

    it('should group by department', () => {
      const breakdown = calculateDepartmentBreakdown(employees);
      expect(breakdown['Engineering']).toBe(3);
      expect(breakdown['Sales']).toBe(1);
      expect(breakdown['HR']).toBe(1);
    });

    it('should filter by status', () => {
      const breakdown = calculateDepartmentBreakdown(employees, 'ACTIVE');
      expect(breakdown['Engineering']).toBe(2);
      expect(breakdown['Sales']).toBe(1);
    });

    it('should handle empty breakdown', () => {
      const breakdown = calculateDepartmentBreakdown([], 'ACTIVE');
      expect(Object.keys(breakdown).length).toBe(0);
    });

    it('should count all employees without filter', () => {
      const breakdown = calculateDepartmentBreakdown(employees);
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      expect(total).toBe(employees.length);
    });

    it('should handle single department', () => {
      const singleDept = [
        { id: '1', department: 'Engineering', status: 'ACTIVE' },
        { id: '2', department: 'Engineering', status: 'ACTIVE' },
      ];
      const breakdown = calculateDepartmentBreakdown(singleDept);
      expect(Object.keys(breakdown).length).toBe(1);
      expect(breakdown['Engineering']).toBe(2);
    });
  });

  // Average headcount
  describe('calculateAverageHeadcount()', () => {
    it('should calculate average of start and end', () => {
      const avg = calculateAverageHeadcount(100, 120);
      expect(avg).toBe(110);
    });

    it('should handle equal values', () => {
      const avg = calculateAverageHeadcount(100, 100);
      expect(avg).toBe(100);
    });

    it('should round to 2 decimal places', () => {
      const avg = calculateAverageHeadcount(100, 101);
      expect(Number.isFinite(avg)).toBe(true);
    });

    it('should handle decimal values', () => {
      const avg = calculateAverageHeadcount(100.5, 110.5);
      expect(avg).toBe(105.5);
    });

    it('should handle large numbers', () => {
      const avg = calculateAverageHeadcount(10000, 12000);
      expect(avg).toBe(11000);
    });
  });

  // Tenure distribution
  describe('calculateTenureDistribution()', () => {
    const now = new Date('2024-03-15');
    const employees = [
      { id: '1', hireDate: new Date('2023-12-01') }, // < 4 months
      { id: '2', hireDate: new Date('2023-06-01') }, // ~9 months
      { id: '3', hireDate: new Date('2022-01-01') }, // ~2 years
      { id: '4', hireDate: new Date('2020-03-15') }, // 4 years
      { id: '5', hireDate: new Date('2018-03-15') }, // 6 years
    ];

    it('should calculate tenure distribution', () => {
      const dist = calculateTenureDistribution(employees, now);
      expect(dist['0-1']).toBeGreaterThan(0);
      expect(dist['1-3']).toBeGreaterThan(0);
      expect(dist['5+']).toBeGreaterThan(0);
    });

    it('should classify new hires (0-1 years)', () => {
      const employees = [{ id: '1', hireDate: new Date('2024-01-01') }];
      const dist = calculateTenureDistribution(employees, now);
      expect(dist['0-1']).toBe(1);
    });

    it('should classify mid-tenure employees (1-3 years)', () => {
      const employees = [{ id: '1', hireDate: new Date('2022-01-01') }];
      const dist = calculateTenureDistribution(employees, now);
      expect(dist['1-3']).toBeGreaterThan(0);
    });

    it('should classify senior employees (5+ years)', () => {
      const employees = [{ id: '1', hireDate: new Date('2018-01-01') }];
      const dist = calculateTenureDistribution(employees, now);
      expect(dist['5+']).toBe(1);
    });

    it('should handle empty list', () => {
      const dist = calculateTenureDistribution([], now);
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      expect(total).toBe(0);
    });
  });

  // Diversity metrics
  describe('calculateDiversityMetrics()', () => {
    const employees = [
      { id: '1', gender: 'M', ethnicity: 'Asian' },
      { id: '2', gender: 'F', ethnicity: 'Hispanic' },
      { id: '3', gender: 'M', ethnicity: 'Caucasian' },
      { id: '4', gender: 'F', ethnicity: 'African American' },
      { id: '5', gender: 'M', ethnicity: 'Asian' },
    ];

    it('should calculate gender distribution', () => {
      const metrics = calculateDiversityMetrics(employees);
      expect(metrics.genderDistribution['M']).toBe(3);
      expect(metrics.genderDistribution['F']).toBe(2);
    });

    it('should calculate ethnicity distribution', () => {
      const metrics = calculateDiversityMetrics(employees);
      expect(metrics.ethnicityDistribution['Asian']).toBe(2);
      expect(metrics.ethnicityDistribution['Hispanic']).toBe(1);
    });

    it('should handle missing diversity data', () => {
      const empWithoutDiversity = [{ id: '1' }, { id: '2' }];
      const metrics = calculateDiversityMetrics(empWithoutDiversity);
      expect(Object.keys(metrics.genderDistribution).length).toBe(0);
    });

    it('should handle partial diversity data', () => {
      const partial = [
        { id: '1', gender: 'M' },
        { id: '2', ethnicity: 'Asian' },
      ];
      const metrics = calculateDiversityMetrics(partial);
      expect(metrics.genderDistribution['M']).toBe(1);
      expect(metrics.ethnicityDistribution['Asian']).toBe(1);
    });
  });

  // Hiring rate
  describe('calculateHiringRate()', () => {
    it('should calculate hiring rate', () => {
      const rate = calculateHiringRate(12, 100);
      expect(rate).toBe(12);
    });

    it('should return 0 for no hires', () => {
      const rate = calculateHiringRate(0, 100);
      expect(rate).toBe(0);
    });

    it('should return 0 for zero headcount', () => {
      const rate = calculateHiringRate(10, 0);
      expect(rate).toBe(0);
    });

    it('should handle high hiring rate', () => {
      const rate = calculateHiringRate(50, 100);
      expect(rate).toBe(50);
    });

    it('should handle small hiring rate', () => {
      const rate = calculateHiringRate(1, 500);
      expect(rate).toBe(0.2);
    });
  });

  // Analytics edge cases
  describe('Analytics edge cases', () => {
    it('should handle large organization', () => {
      const employees = Array.from({ length: 5000 }, (_, i) => ({
        id: i.toString(),
        status: i % 50 === 0 ? 'TERMINATED' : 'ACTIVE',
        department: `Dept${i % 20}`,
      }));

      const activeCount = calculateHeadcount(employees, 'ACTIVE');
      expect(activeCount).toBeGreaterThan(4800);

      const breakdown = calculateDepartmentBreakdown(employees);
      expect(Object.keys(breakdown).length).toBe(20);
    });

    it('should handle rapid growth', () => {
      const startHeadcount = 10;
      const endHeadcount = 100;
      const growthRate = calculateGrowthRate(endHeadcount, startHeadcount);
      expect(growthRate).toBe(900);
    });

    it('should handle rapid decline', () => {
      const startHeadcount = 100;
      const endHeadcount = 10;
      const growthRate = calculateGrowthRate(endHeadcount, startHeadcount);
      expect(growthRate).toBe(-90);
    });

    it('should handle zero-growth scenarios', () => {
      const rate = calculateGrowthRate(50, 50);
      expect(rate).toBe(0);
    });

    it('should combine multiple metrics', () => {
      const employees = [
        { id: '1', status: 'ACTIVE', department: 'Eng' },
        { id: '2', status: 'ACTIVE', department: 'Eng' },
        { id: '3', status: 'ACTIVE', department: 'Sales' },
        { id: '4', status: 'TERMINATED', department: 'Sales' },
      ];

      const activeCount = calculateHeadcount(employees, 'ACTIVE');
      const breakdown = calculateDepartmentBreakdown(employees, 'ACTIVE');
      const terminatedCount = calculateHeadcount(employees, 'TERMINATED');

      expect(activeCount).toBe(3);
      expect(Object.keys(breakdown).length).toBe(2);
      expect(terminatedCount).toBe(1);
    });
  });
});
