import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { trpc } from '@/lib/trpc'
import { AddTaskModal } from '@/components/onboarding/add-task-modal'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      createTask: {
        useMutation: vi.fn(),
      },
      createOffboardingTask: {
        useMutation: vi.fn(),
      },
      listNewHires: {
        invalidate: vi.fn(),
      },
    },
    employee: {
      list: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
    },
    useUtils: vi.fn(() => ({
      onboarding: {
        listNewHires: {
          invalidate: vi.fn(),
        },
        listOffboarding: {
          invalidate: vi.fn(),
        },
      },
    })),
  },
}))

describe('AddTaskModal', () => {
  const mockEmployeeId = 'emp-123'
  const mockEmployeeName = 'John Doe'
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(trpc.onboarding.createTask.useMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'task-1' }),
      isLoading: false,
    } as any)
    vi.mocked(trpc.onboarding.createOffboardingTask.useMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'task-2' }),
      isLoading: false,
    } as any)
  })

  it('renders correctly when open', () => {
    render(
      <AddTaskModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    expect(screen.getByText(`Add Onboarding Task for ${mockEmployeeName}`)).toBeInTheDocument()
    expect(screen.getByText(/task title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument()
  })

  it('includes section field in the form', () => {
    render(<AddTaskModal open={true} employeeId="emp-1" employeeName="John Doe" onOpenChange={() => {}} />)
    expect(screen.getByLabelText(/section/i)).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when cancel is clicked', async () => {
    render(
      <AddTaskModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows validation error when title is empty', async () => {
    render(
      <AddTaskModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(vi.mocked(trpc.onboarding.createTask.useMutation)().mutateAsync).not.toHaveBeenCalled()
  })

  it('submits correctly with valid data including section', async () => {
    render(
      <AddTaskModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    // Switch to custom title mode
    await userEvent.click(screen.getByText(/custom title/i))
    // Now find the text input and type
    const titleInput = screen.getByPlaceholderText(/type a custom task title/i)
    await userEvent.type(titleInput, 'New Task')
    await userEvent.type(screen.getByLabelText(/description/i), 'Task Description')
    await userEvent.type(screen.getByLabelText(/due date/i), '2026-12-31')

    await userEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => {
      expect(vi.mocked(trpc.onboarding.createTask.useMutation)().mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: mockEmployeeId,
          title: 'New Task',
          description: 'Task Description',
          section: expect.any(String),
          dueDate: expect.any(Date),
        })
      )
    })

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })
})
