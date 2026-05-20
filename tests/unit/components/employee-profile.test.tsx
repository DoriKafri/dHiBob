import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: { id: 'user-1', employeeId: 'emp-1', companyId: 'co-1', role: 'ADMIN', email: 'a@b.com', name: 'Alice' },
    },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    employee: {
      getById: {
        useQuery: vi.fn(),
      },
      update: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      terminate: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      updateRole: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      updatePersonalInfo: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      updateWorkInfo: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      list: {
        useQuery: vi.fn(() => ({ data: { employees: [] } })),
      },
      getExchangeRates: {
        useQuery: vi.fn(() => ({ data: null })),
      },
      getEmployeeAssets: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      getEmployeeLicenses: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
    signature: {
      requestSignature: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false })),
      },
      getPending: {
        useQuery: vi.fn(() => ({ data: [], refetch: vi.fn() })),
      },
      sign: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      decline: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      getByDocument: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      getPdfUrl: {
        useQuery: vi.fn(() => ({ data: { url: '/api/files/download?path=test.pdf' }, isLoading: false })),
      },
    },
    document: {
      list: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      createForSignature: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      listByEmployee: {
        useQuery: vi.fn(() => ({ data: [] })),
      },
      getDocumentPdfUrl: {
        useQuery: vi.fn(() => ({ data: { url: '/api/files/download?path=test.pdf' }, isLoading: false })),
      },
    },
    useContext: () => ({
      employee: {
        getById: { invalidate: vi.fn() },
      },
      signature: {
        getByDocument: { fetch: vi.fn().mockResolvedValue([]) },
        getSignedPdf: { fetch: vi.fn().mockResolvedValue({ url: '/signed.pdf' }) },
      },
    }),
  },
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'emp-test-1' }),
  useRouter: () => ({ back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { trpc } from '@/lib/trpc'
import EmployeeProfilePage from '@/app/(dashboard)/people/[id]/page'

const mockEmployee = {
  id: 'emp-test-1',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  email: 'alice@test.corp',
  status: 'ACTIVE',
  startDate: new Date('2022-01-10'),
  employmentType: 'FULL_TIME',
  companyId: 'co-1',
  department: { id: 'dept-1', name: 'Engineering', companyId: 'co-1' },
  site: { id: 'site-1', name: 'New York', country: 'USA', timezone: 'EST', companyId: 'co-1' },
  manager: {
    id: 'mgr-1',
    firstName: 'Bob',
    lastName: 'Manager',
    displayName: 'Bob Manager',
    email: 'bob.manager@test.corp',
    status: 'ACTIVE',
    startDate: new Date('2020-01-01'),
    employmentType: 'FULL_TIME',
    companyId: 'co-1',
  },
  directReports: [
    { id: 'dr-1', firstName: 'Carol', lastName: 'Report' },
  ],
  company: { id: 'co-1', name: 'Test Corp', domain: 'test.corp', settings: '{}' },
  user: { id: 'user-1', email: 'alice@test.corp', role: 'EMPLOYEE' },
  personalInfo: '{}',
  workInfo: '{}',
  customFields: '{}',
  teamId: null,
  managerId: 'mgr-1',
  departmentId: 'dept-1',
  siteId: 'site-1',
  avatar: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('Employee profile page', () => {
  it('renders employee full name', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    const nameElements = screen.getAllByText('Alice Smith')
    expect(nameElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows ACTIVE status badge', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows employee email', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    const emailElements = screen.getAllByText('alice@test.corp')
    expect(emailElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows manager name in Work tab (Role section)', async () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getAllByText(/Bob Manager/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Team Leader (TL)')).toBeInTheDocument()
  })

  it('shows department name', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    const deptElements = screen.getAllByText(/Engineering/)
    expect(deptElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading state', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows not found when error', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Employee not found' },
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('does not show hardcoded Sarah Chen', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.queryByText('Sarah Chen')).not.toBeInTheDocument()
  })

  // T-01: Profile tab is the default visible tab
  it('Profile tab is the default visible tab', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('General Info')).toBeInTheDocument()
  })

  // T-02: Profile tab General Info section renders personalInfo fields
  it('Profile tab General Info section renders personalInfo fields', () => {
    const mockEmployeeWithPersonalInfo = {
      ...mockEmployee,
      personalInfo: JSON.stringify({ phone: '555-0100', dateOfBirth: '1990-01-01', gender: 'Female' }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployeeWithPersonalInfo,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('555-0100')).toBeInTheDocument()
    expect(screen.getByText('Jan 1, 1990')).toBeInTheDocument()
    expect(screen.getByText('Female')).toBeInTheDocument()
  })

  // T-03: Work tab contains Role section and manager name
  it('Work tab contains Role section and manager name', async () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getAllByText(/Bob Manager/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Team Leader (TL)')).toBeInTheDocument()
    expect(screen.queryByText('Reports To')).not.toBeInTheDocument()
  })

  // T-05: Profile tab shows Identification section (merged from Personal)
  it('Profile tab shows Identification section', async () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Identification')).toBeInTheDocument()
  })

  // T-06: Profile tab shows Address section (merged from Personal)
  it('Profile tab shows Address section', async () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    const addressElements = screen.getAllByText('Address')
    expect(addressElements.length).toBeGreaterThanOrEqual(1)
  })

  // T-07: Work tab shows Initiation section
  it('Work tab shows Initiation section', async () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByText('Work'))
    expect(screen.getByText('Initiation')).toBeInTheDocument()
  })

  // T-08: Assets tab renders without crash
  it('Assets tab renders without crash', async () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByText('Assets'))
    const assetsElements = screen.getAllByText('Assets')
    expect(assetsElements.length).toBeGreaterThanOrEqual(1)
  })

  // T-09: Old tab names no longer present after redesign
  it('Old tab names no longer present after redesign', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.queryByText('Employment')).toBeNull()
    expect(screen.queryByText('Additional Data')).toBeNull()
    expect(screen.queryByText('Timeline')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Assets' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Salary' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Personal' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Client' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'HR talks' })).toBeNull()
  })

  // T-10: Header subtitle shows TL: instead of Reports to
  it('header subtitle shows TL: prefix instead of Reports to', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText(/TL:/)).toBeInTheDocument()
    expect(screen.queryByText(/Reports to/)).not.toBeInTheDocument()
  })

  // T-11: Team field is removed from Role section
  it('Team field is removed from Role section', async () => {
    const mockEmployeeWithTeam = {
      ...mockEmployee,
      workInfo: JSON.stringify({ team: 'Alpha Squad' }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployeeWithTeam,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Squad')).not.toBeInTheDocument()
  })

  // T-12: GL shows skip-level manager name when TL has a manager
  it('Role section shows Group Leader (GL) derived from TL manager', async () => {
    const mockEmployeeWithGL = {
      ...mockEmployee,
      manager: {
        ...mockEmployee.manager,
        manager: { id: 'gl-1', firstName: 'Grace', lastName: 'Leader' },
      },
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployeeWithGL,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getByText('Group Leader (GL)')).toBeInTheDocument()
    expect(screen.getByText('Grace Leader')).toBeInTheDocument()
  })

  // T-13: GL shows dash when TL has no manager
  it('Role section shows dash for GL when TL has no manager', async () => {
    const mockEmployeeWithNoGL = {
      ...mockEmployee,
      manager: {
        ...mockEmployee.manager,
        manager: null,
      },
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployeeWithNoGL,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getByText('Group Leader (GL)')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  // T-14: GL shows dash when employee has no TL
  it('Role section shows dash for GL when employee has no TL', async () => {
    const mockEmployeeNoManager = {
      ...mockEmployee,
      manager: null,
      managerId: null,
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployeeNoManager,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getByText('Group Leader (GL)')).toBeInTheDocument()
  })

  // T-15: ILS appears in currency options on profile page
  it('ILS appears in currency options on profile page', async () => {
    const mockEmployeeWithSalary = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        salaryHistory: [
          { effectiveDate: '2023-01-01', salaryAmount: '5000', salaryCurrency: 'ILS' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployeeWithSalary,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(screen.getByText('ILS')).toBeInTheDocument()
  })

  // Certifications section tests (on Profile tab, visible to all)
  it('shows Certifications section on Profile tab', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Certifications')).toBeInTheDocument()
    expect(screen.getByText('Professional certifications and licenses')).toBeInTheDocument()
  })

  it('renders certifications table with headers on Profile tab', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Issuing Authority')).toBeInTheDocument()
    expect(screen.getByText('Issue Date')).toBeInTheDocument()
    expect(screen.getByText('Expiry Date')).toBeInTheDocument()
  })

  it('shows Add certification button for admin users', () => {
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockEmployee,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Add certification')).toBeInTheDocument()
  })

  it('renders certification data from workInfo', () => {
    const mockWithCerts = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        certifications: [
          { name: 'AWS Solutions Architect', issuingAuthority: 'Amazon Web Services', issueDate: '2024-06-15', expiryDate: '2027-06-15', documentUrl: '' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockWithCerts,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('AWS Solutions Architect')).toBeInTheDocument()
    expect(screen.getByText('Amazon Web Services')).toBeInTheDocument()
  })

  it('shows Expired badge for past expiry date', () => {
    const mockWithExpired = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        certifications: [
          { name: 'Old Cert', issuingAuthority: 'Test Org', issueDate: '2020-01-01', expiryDate: '2023-01-01', documentUrl: '' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockWithExpired,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('shows Expiring soon badge for expiry within 90 days', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 30) // 30 days from now
    const mockWithExpiringSoon = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        certifications: [
          { name: 'Expiring Cert', issuingAuthority: 'Test Org', issueDate: '2023-01-01', expiryDate: soon.toISOString().slice(0, 10), documentUrl: '' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockWithExpiringSoon,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('Expiring soon')).toBeInTheDocument()
  })

  it('does not show expiry badge when expiry date is far in the future', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 2) // 2 years from now
    const mockWithFutureCert = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        certifications: [
          { name: 'Valid Cert', issuingAuthority: 'Test Org', issueDate: '2023-01-01', expiryDate: future.toISOString().slice(0, 10), documentUrl: '' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockWithFutureCert,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.queryByText('Expired')).not.toBeInTheDocument()
    expect(screen.queryByText('Expiring soon')).not.toBeInTheDocument()
  })

  it('renders multiple certifications', () => {
    const mockWithMultipleCerts = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        certifications: [
          { name: 'PMP', issuingAuthority: 'PMI', issueDate: '2022-03-01', expiryDate: '', documentUrl: '' },
          { name: 'CISSP', issuingAuthority: 'ISC2', issueDate: '2023-11-01', expiryDate: '', documentUrl: '' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockWithMultipleCerts,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    expect(screen.getByText('PMP')).toBeInTheDocument()
    expect(screen.getByText('PMI')).toBeInTheDocument()
    expect(screen.getByText('CISSP')).toBeInTheDocument()
    expect(screen.getByText('ISC2')).toBeInTheDocument()
  })

  // R1: Compensation History shows pen icon for sending contract docs for signature
  it('R1: shows pen icon next to contract documents in Compensation History for admin', async () => {
    const mockWithSalary = {
      ...mockEmployee,
      workInfo: JSON.stringify({
        salaryHistory: [
          { effectiveDate: '2024-01-01', contractType: 'Full-time', salaryType: 'Base Salary', salaryAmount: '10000', salaryCurrency: 'USD', contractDoc: JSON.stringify([{ name: 'contract.pdf', key: 'contracts/contract.pdf' }]), note: '' },
        ],
      }),
    }
    vi.mocked(trpc.employee.getById.useQuery).mockReturnValue({
      data: mockWithSalary,
      isLoading: false,
      error: null,
    } as any)
    render(<EmployeeProfilePage params={{ id: 'emp-test-1' }} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    // Should have a "Send for signature" button (pen icon)
    expect(screen.getByTitle('Send for signature')).toBeInTheDocument()
  })
})
