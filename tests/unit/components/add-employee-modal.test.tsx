import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    employee: {
      create: {
        useMutation: vi.fn(),
      },
      list: {
        useQuery: vi.fn(),
      },
    },
    useContext: vi.fn(() => ({
      employee: { list: { invalidate: vi.fn() } },
    })),
  },
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}))

import { trpc } from '@/lib/trpc'
import { AddEmployeeModal } from '@/components/people/add-employee-modal'

beforeEach(() => {
  vi.mocked(trpc.employee.create.useMutation).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'new-emp-1' }),
    isLoading: false,
    error: null,
  } as any)
})

describe('AddEmployeeModal', () => {
  it('does not render when open=false', () => {
    render(<AddEmployeeModal open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders form fields when open=true', () => {
    render(<AddEmployeeModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('submit button is visible', () => {
    render(<AddEmployeeModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add employee/i })).toBeInTheDocument()
  })

  it('shows validation error for empty required fields on submit', async () => {
    const onOpenChange = vi.fn()
    render(<AddEmployeeModal open={true} onOpenChange={onOpenChange} />)
    const submitBtn = screen.getByRole('button', { name: /add employee/i })
    await userEvent.click(submitBtn)
    // Form validation should prevent submission and show error
    expect(vi.mocked(trpc.employee.create.useMutation)().mutateAsync).not.toHaveBeenCalled()
  })

  it('calls create mutation with form data on valid submit', async () => {
    const onOpenChange = vi.fn()
    render(<AddEmployeeModal open={true} onOpenChange={onOpenChange} />)

    await userEvent.type(screen.getByLabelText(/first name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(screen.getByLabelText(/email/i), 'jane@test.corp')

    const submitBtn = screen.getByRole('button', { name: /add employee/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(vi.mocked(trpc.employee.create.useMutation)().mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@test.corp',
          companyId: 'co-1',
        })
      )
    })
  })

  it('closes modal after successful submission', async () => {
    const onOpenChange = vi.fn()
    render(<AddEmployeeModal open={true} onOpenChange={onOpenChange} />)

    await userEvent.type(screen.getByLabelText(/first name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(screen.getByLabelText(/email/i), 'jane@test.corp')

    await userEvent.click(screen.getByRole('button', { name: /add employee/i }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
