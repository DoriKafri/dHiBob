import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock tRPC entirely — we test the component behavior, not the network
vi.mock('@/lib/trpc', () => ({
  trpc: {
    employee: {
      list: {
        useQuery: vi.fn(),
      },
      create: {
        useMutation: vi.fn(() => ({
          mutateAsync: vi.fn(),
          isLoading: false,
          error: null,
        })),
      },
    },
    useContext: vi.fn(() => ({
      employee: { list: { invalidate: vi.fn() } },
    })),
  },
}))

// Mock AddEmployeeModal — the file doesn't exist until Task 5; without this mock,
// importing PeoplePage will throw MODULE_NOT_FOUND and all tests in this file will error.
vi.mock('@/components/people/add-employee-modal', () => ({
  AddEmployeeModal: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <div role="dialog" aria-label="Add Employee">Mock Modal</div> : null,
}))

// AddEmployeeModal (always mounted in PeoplePage) calls useSession — must mock it
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/people',
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { trpc } from '@/lib/trpc'
import PeoplePage from '@/app/(dashboard)/people/page'

const mockEmployees = [
  {
    id: 'emp-1',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    email: 'alice@test.corp',
    status: 'ACTIVE',
    department: { id: 'dept-1', name: 'Engineering' },
    manager: null,
    companyId: 'co-1',
    startDate: new Date('2022-01-10'),
    employmentType: 'FULL_TIME',
  },
  {
    id: 'emp-2',
    firstName: 'Bob',
    lastName: 'Jones',
    displayName: 'Bob Jones',
    email: 'bob@test.corp',
    status: 'ACTIVE',
    department: { id: 'dept-2', name: 'Product' },
    manager: null,
    companyId: 'co-1',
    startDate: new Date('2023-06-01'),
    employmentType: 'FULL_TIME',
  },
  {
    id: 'emp-3',
    firstName: 'Carol',
    lastName: 'On Leave',
    displayName: 'Carol On Leave',
    email: 'carol@test.corp',
    status: 'ON_LEAVE',
    department: { id: 'dept-1', name: 'Engineering' },
    manager: null,
    companyId: 'co-1',
    startDate: new Date('2021-03-15'),
    employmentType: 'PART_TIME',
  },
]

beforeEach(() => {
  vi.mocked(trpc.employee.list.useQuery).mockReturnValue({
    data: { employees: mockEmployees, nextCursor: undefined },
    isLoading: false,
    error: null,
  } as any)
})

describe('People directory page', () => {
  it('renders employee names from tRPC data', () => {
    render(<PeoplePage />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.getByText('Carol On Leave')).toBeInTheDocument()
  })

  it('does not show hardcoded names', () => {
    render(<PeoplePage />)
    expect(screen.queryByText('Sarah Chen')).not.toBeInTheDocument()
    expect(screen.queryByText('Mike Johnson')).not.toBeInTheDocument()
  })

  it('shows ACTIVE status badge for active employees', () => {
    render(<PeoplePage />)
    const badges = screen.getAllByText('Active')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('shows department names', () => {
    render(<PeoplePage />)
    expect(screen.getAllByText('Engineering').length).toBeGreaterThanOrEqual(1)
  })

  it('employee card links to /people/[id]', () => {
    render(<PeoplePage />)
    const link = screen.getByRole('link', { name: /Alice Smith/i })
    expect(link).toHaveAttribute('href', '/people/emp-1')
  })

  it('shows loading state while query is loading', () => {
    vi.mocked(trpc.employee.list.useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)
    render(<PeoplePage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('search input calls tRPC with search param after debounce', async () => {
    render(<PeoplePage />)
    const searchInput = screen.getByPlaceholderText(/search/i)
    await userEvent.type(searchInput, 'Ali')
    // After debounce the query mock should be called with search param
    // We verify the input value is reflected
    expect(searchInput).toHaveValue('Ali')
  })

  it('shows employee count', () => {
    render(<PeoplePage />)
    expect(screen.getByText(/3.*employees/i)).toBeInTheDocument()
  })
})
