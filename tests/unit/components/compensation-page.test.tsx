// tests/unit/components/compensation-page.test.tsx
import { render, screen } from '@testing-library/react';
import CompensationPage from '../../../src/app/(dashboard)/compensation/page';
import { trpc } from '../../../src/lib/trpc';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../../src/lib/trpc', () => ({
  trpc: {
    compensation: {
      getStats: {
        useQuery: vi.fn().mockReturnValue({ data: { avgSalary: 105000, avgCompaRatio: 1.05, budgetUsed: 87, equityGrants: 42 }, isLoading: false }),
      }
    }
  }
}));

describe('CompensationPage', () => {
  it('renders dynamic stats', () => {
    render(<CompensationPage />);
    expect(screen.getByText('$105K')).toBeDefined();
    expect(screen.getByText('1.05')).toBeDefined();
  });
});