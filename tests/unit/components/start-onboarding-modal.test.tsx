import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { trpc } from '@/lib/trpc'
import { StartOnboardingModal } from '@/components/onboarding/start-onboarding-modal'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    onboarding: {
      listTemplates: {
        useQuery: vi.fn(),
      },
      start: {
        useMutation: vi.fn(),
      },
    },
    useContext: vi.fn(() => ({
      onboarding: {
        listNewHires: {
          invalidate: vi.fn(),
        },
      },
    })),
  },
}))

// Mock UI components from Radix/Shadcn that might be hard to test in JSDOM
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))

// Mock Select component because it's hard to test Radix Select in JSDOM
vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: any) => (
    <select onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

describe('StartOnboardingModal', () => {
  const mockEmployeeId = 'emp-123'
  const mockEmployeeName = 'Jane Doe'
  const mockOnOpenChange = vi.fn()
  const mockTemplates = [
    { id: 'template-1', name: 'Standard Onboarding' },
    { id: 'template-2', name: 'Engineering Onboarding' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(trpc.onboarding.listTemplates.useQuery).mockReturnValue({
      data: mockTemplates,
      isLoading: false,
    } as any)
    vi.mocked(trpc.onboarding.start.useMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'onboarding-1' }),
      isLoading: false,
    } as any)
  })

  it('renders correctly when open', () => {
    render(
      <StartOnboardingModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    expect(screen.getByText(`Start Onboarding for ${mockEmployeeName}`)).toBeInTheDocument()
    expect(screen.getAllByText(/select a template/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /start onboarding/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when cancel is clicked', async () => {
    render(
      <StartOnboardingModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('enables start button and submits correctly when template is selected', async () => {
    render(
      <StartOnboardingModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    const startButton = screen.getByRole('button', { name: /start onboarding/i })
    expect(startButton).toBeDisabled()

    // Select a template
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'template-1' } })

    expect(startButton).toBeEnabled()

    await userEvent.click(startButton)

    await waitFor(() => {
      expect(vi.mocked(trpc.onboarding.start.useMutation)().mutateAsync).toHaveBeenCalledWith({
        employeeId: mockEmployeeId,
        templateId: 'template-1',
      })
    })

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows templates in the dropdown', () => {
    render(
      <StartOnboardingModal
        employeeId={mockEmployeeId}
        employeeName={mockEmployeeName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    expect(screen.getByText('Standard Onboarding')).toBeInTheDocument()
    expect(screen.getByText('Engineering Onboarding')).toBeInTheDocument()
  })
})
