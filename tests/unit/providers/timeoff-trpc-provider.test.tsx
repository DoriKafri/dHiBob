import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the trpc module so we can verify Provider is rendered
vi.mock('@/lib/trpc', () => ({
  trpc: {
    Provider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="trpc-provider">{children}</div>
    ),
    createClient: vi.fn(() => ({})),
  },
}));

vi.mock('@trpc/client', () => ({ httpBatchLink: vi.fn(() => ({})) }));

import Providers from '@/app/providers';

describe('Providers', () => {
  it('renders trpc.Provider around children', () => {
    render(<Providers><span data-testid="child">hello</span></Providers>);
    expect(screen.getByTestId('trpc-provider')).toBeDefined();
    expect(screen.getByTestId('child')).toBeDefined();
  });
});
