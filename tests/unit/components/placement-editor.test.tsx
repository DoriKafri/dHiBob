import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792, scale: 1 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  const mockDoc = {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(mockPage),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockDoc) }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

// Mock fetch for PDF loading
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
}));

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  trpc: {
    signature: {
      requestSignature: {
        useMutation: vi.fn().mockReturnValue({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({ id: 'sig-1' }),
          isPending: false,
          error: null,
        }),
      },
    },
    document: {
      getDocumentPdfUrl: {
        useQuery: vi.fn().mockReturnValue({
          data: { url: '/api/files/download?path=test.pdf' },
          isLoading: false,
        }),
      },
    },
    employee: {
      list: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            employees: [
              { id: 'emp-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.tech' },
              { id: 'emp-2', firstName: 'John', lastName: 'Smith', email: 'john@acme.tech' },
            ],
          },
        }),
      },
    },
  },
}));

import { PlacementDialog } from '@/components/documents/placement-dialog';

describe('PlacementDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    documentId: 'doc-1',
    documentName: 'Contract.pdf',
    onComplete: vi.fn(),
  };

  it('PE-1: shows signer picker in step 1', () => {
    render(<PlacementDialog {...defaultProps} />);
    expect(screen.getByText(/select signer/i)).toBeInTheDocument();
  });

  it('PE-2: advances to placement step after selecting signer', async () => {
    const user = userEvent.setup();
    const { container } = render(<PlacementDialog {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'emp-1');

    const nextBtn = screen.getByRole('button', { name: /next|mark/i });
    await user.click(nextBtn);

    // Should show PDF viewer — verify signer picker is gone and placement step is shown
    await waitFor(() => {
      expect(screen.queryByText(/select signer/i)).not.toBeInTheDocument();
    });

    // Wait for the placement step to be visible (either loading PDF or loaded)
    await waitFor(() => {
      // In placement step, either the PdfViewer or loading indicator is shown
      const bodyText = document.body.textContent || '';
      expect(bodyText).toMatch(/page 1|loading|placement/i);
    }, { timeout: 3000 });
  });

  it('PE-3: shows send button in placement step', async () => {
    const user = userEvent.setup();
    render(<PlacementDialog {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'emp-1');
    const nextBtn = screen.getByRole('button', { name: /next|mark/i });
    await user.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });
  });

  it('PE-4: can add a placement by clicking on the PDF', async () => {
    const user = userEvent.setup();
    render(<PlacementDialog {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'emp-1');
    const nextBtn = screen.getByRole('button', { name: /next|mark/i });
    await user.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-0')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('pdf-page-0'), { clientX: 100, clientY: 200 });

    expect(screen.getByTestId('placement-0')).toBeInTheDocument();
  });

  it('PE-5: can remove a placement', async () => {
    const user = userEvent.setup();
    render(<PlacementDialog {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'emp-1');
    const nextBtn = screen.getByRole('button', { name: /next|mark/i });
    await user.click(nextBtn);

    await screen.findByTestId('pdf-page-0');
    fireEvent.click(screen.getByTestId('pdf-page-0'), { clientX: 100, clientY: 200 });
    expect(screen.getByTestId('placement-0')).toBeInTheDocument();

    const removeBtn = screen.getByTestId('remove-placement-0');
    await user.click(removeBtn);

    expect(screen.queryByTestId('placement-0')).not.toBeInTheDocument();
  });

  it('PE-6: send button calls requestSignature with placements JSON', async () => {
    const { trpc } = await import('@/lib/trpc');
    const mutateFn = vi.fn().mockResolvedValue({ id: 'sig-1' });
    (trpc.signature.requestSignature.useMutation as any).mockReturnValue({
      mutateAsync: mutateFn,
      mutate: mutateFn,
      isPending: false,
      error: null,
    });

    const user = userEvent.setup();
    render(<PlacementDialog {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'emp-1');
    const nextBtn = screen.getByRole('button', { name: /next|mark/i });
    await user.click(nextBtn);

    await screen.findByTestId('pdf-page-0');
    fireEvent.click(screen.getByTestId('pdf-page-0'), { clientX: 100, clientY: 200 });

    const sendBtn = screen.getByRole('button', { name: /send/i });
    await user.click(sendBtn);

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        signerId: 'emp-1',
        placements: expect.any(String),
      }),
    );
  });

  it('PE-7: works with pre-set signerId (from people page)', () => {
    render(<PlacementDialog {...defaultProps} presetSignerId="emp-2" />);
    // Should skip signer picker and go straight to placement
    expect(screen.queryByText(/select signer/i)).not.toBeInTheDocument();
  });
});
