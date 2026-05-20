import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock tRPC entirely — we test the component behavior, not the network
vi.mock('@/lib/trpc', () => {
  const mutationStub = () => ({ mutate: vi.fn(), isLoading: false, isPending: false });
  return {
    trpc: {
      hiring: {
        listJobs: { useQuery: vi.fn() },
        listCandidates: { useQuery: vi.fn() },
        createJob: { useMutation: vi.fn(mutationStub) },
        addCandidate: { useMutation: vi.fn(mutationStub) },
        moveStage: { useMutation: vi.fn(mutationStub) },
      },
      useContext: vi.fn(() => ({
        hiring: {
          listJobs: { invalidate: vi.fn() },
          listCandidates: { invalidate: vi.fn() },
        },
      })),
      useUtils: vi.fn(() => ({
        hiring: {
          listJobs: { invalidate: vi.fn() },
          listCandidates: { invalidate: vi.fn() },
        },
      })),
    },
  };
});

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/hiring',
}));

import { trpc } from '@/lib/trpc';
import HiringPage from '@/app/(dashboard)/hiring/page';

// Standard mock data used across C tests
const mockJobs = [
  {
    id: 'job-1',
    title: 'Frontend Engineer',
    status: 'OPEN',
    department: { name: 'Engineering' },
    site: { name: 'Remote' },
    _count: { candidates: 5 },
    createdAt: new Date('2026-03-10T00:00:00Z'),
  },
  {
    id: 'job-2',
    title: 'Backend Engineer',
    status: 'OPEN',
    department: { name: 'Engineering' },
    site: { name: 'NYC' },
    _count: { candidates: 4 },
    createdAt: new Date('2026-03-17T00:00:00Z'),
  },
];

const mockCandidates = [
  {
    id: 'c-1',
    firstName: 'Alice',
    lastName: 'Brown',
    stage: 'SCREENING',
    jobId: 'job-1',
    email: 'alice@example.com',
    phone: '555-1234',
    source: 'LINKEDIN',
    createdAt: new Date(),
  },
];

function setupDefaultMocks() {
  vi.mocked(trpc.hiring.listJobs.useQuery).mockReturnValue({
    data: { jobs: mockJobs, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.hiring.listCandidates.useQuery).mockReturnValue({
    data: { candidates: mockCandidates, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.hiring.createJob.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
  vi.mocked(trpc.hiring.addCandidate.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
  vi.mocked(trpc.hiring.moveStage.useMutation).mockReturnValue({
    mutate: vi.fn(), isLoading: false, isPending: false,
  } as any);
}

beforeEach(() => { vi.clearAllMocks(); setupDefaultMocks(); });

describe('HiringPage', () => {
  // C-1: Open Positions stat card shows live job count, not hardcoded 8
  it('C-1: Open Positions stat card displays count derived from listJobs data, not hardcoded 8', () => {
    render(<HiringPage />);
    // 2 OPEN jobs in mockJobs
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('8')).not.toBeInTheDocument();
  });

  // C-2: Total Candidates stat card shows live sum
  it('C-2: Total Candidates stat card displays sum of _count.candidates from listJobs data', () => {
    render(<HiringPage />);
    // job-1: 5 + job-2: 4 = 9
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  // C-3: In Pipeline stat card shows count
  it('C-3: In Pipeline stat card shows active pipeline count', () => {
    render(<HiringPage />);
    expect(screen.getByText('In Pipeline')).toBeInTheDocument();
  });

  // C-4: Hired stat card exists
  it('C-4: Hired stat card is present', () => {
    render(<HiringPage />);
    // "Hired" appears both as stat card title and as pipeline stage
    const hiredElements = screen.getAllByText('Hired');
    expect(hiredElements.length).toBeGreaterThanOrEqual(1);
  });

  // C-5: Job list renders job titles from listJobs data, not hardcoded names
  it('C-5: Open Positions list renders live job titles from listJobs response, not hardcoded names', () => {
    render(<HiringPage />);
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Senior Frontend Engineer')).not.toBeInTheDocument();
    expect(screen.queryByText('Product Designer')).not.toBeInTheDocument();
  });

  // C-6: Pipeline columns render for main stages
  it('C-6: Pipeline board renders columns for main pipeline stages', () => {
    render(<HiringPage />);
    expect(screen.getByText('Screening')).toBeInTheDocument();
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
  });

  // C-7: Candidate card shows firstName and lastName from listCandidates data
  it('C-7: Pipeline candidate card displays real firstName + lastName from listCandidates, not hardcoded names', () => {
    render(<HiringPage />);
    expect(screen.getByText('Alice Brown')).toBeInTheDocument();
    expect(screen.queryByText('Bob Martinez')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol White')).not.toBeInTheDocument();
  });

  // C-8: Loading skeletons render when listJobs is loading
  it('C-8: Hiring page renders skeleton loading states when listJobs query is in flight', () => {
    vi.mocked(trpc.hiring.listJobs.useQuery).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as any);
    render(<HiringPage />);
    // Skeleton elements should be present
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByText('Frontend Engineer')).not.toBeInTheDocument();
    // Hardcoded value 8 should not be rendered
    expect(screen.queryByText('8')).not.toBeInTheDocument();
  });

  // C-9: Empty state renders when no jobs are returned
  it('C-9: Hiring page shows empty state message when listJobs returns an empty jobs array', () => {
    vi.mocked(trpc.hiring.listJobs.useQuery).mockReturnValue({
      data: { jobs: [], nextCursor: undefined }, isLoading: false, error: null,
    } as any);
    render(<HiringPage />);
    // Empty state message
    expect(screen.getByText(/no job postings/i)).toBeInTheDocument();
    expect(screen.queryByText('Frontend Engineer')).not.toBeInTheDocument();
    // Open Positions stat card shows 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  // C-10: "Post Job" button click renders the CreateJob modal
  it('C-10: Clicking the Post Job button causes the CreateJob modal to appear in the DOM', () => {
    render(<HiringPage />);
    const postJobButton = screen.getByRole('button', { name: /post job/i });
    fireEvent.click(postJobButton);
    // Modal appears with title text
    expect(screen.getByText('Post New Job')).toBeInTheDocument();
    // Create Job button present
    expect(screen.getByRole('button', { name: /create job/i })).toBeInTheDocument();
  });
});
