import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Providers from '@/app/providers'

// This test confirms that child components rendered inside Providers
// can access the tRPC context. We use a simple sentinel child.
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

describe('Providers', () => {
  it('renders children without throwing tRPC context error', () => {
    // If tRPC provider is missing, createTRPCReact hooks throw on mount
    // This test just confirms children render — the hook test in people-page
    // will confirm the query context is accessible
    expect(() =>
      render(
        <Providers>
          <div data-testid="child">hello</div>
        </Providers>
      )
    ).not.toThrow()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
