import { describe, it, expect } from 'vitest';
import { getCurrentSalary, calculateCompaRatio } from '../../../src/lib/compensation-engine';

describe('Compensation Engine', () => {
  it('gets the latest approved salary', () => {
    const events = [
      { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: new Date('2025-01-01'), salary: 90000 },
      { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: new Date('2026-01-01'), salary: 100000 },
      { type: 'BASE_SALARY', status: 'PENDING', effectiveDate: new Date('2026-06-01'), salary: 110000 },
    ] as any[];
    
    expect(getCurrentSalary(events, new Date())).toBe(100000);
  });

  it('calculates compa-ratio', () => {
    const band = { midSalary: 100000 } as any;
    expect(calculateCompaRatio(105000, band)).toBe(1.05);
  });
});
