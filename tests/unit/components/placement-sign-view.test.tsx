import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      sign: {
        useMutation: vi.fn().mockReturnValue({
          mutate: vi.fn(),
          isPending: false,
          error: null,
        }),
      },
      decline: {
        useMutation: vi.fn().mockReturnValue({
          mutate: vi.fn(),
          isPending: false,
          error: null,
        }),
      },
      getPdfUrl: {
        useQuery: vi.fn().mockReturnValue({
          data: { url: '/api/files/download?path=test.pdf' },
          isLoading: false,
        }),
      },
    },
  },
}));

import { PdfViewer } from '@/components/documents/pdf-viewer';
import { SignatureDialog } from '@/components/documents/signature-dialog';

// Warm up PdfViewer's module-level pdfjsLib cache by rendering once before tests.
// The dynamic `import("pdfjs-dist")` inside PdfViewer sets a module-level variable
// on first render; without this warm-up, the first test's async resolution may not
// complete before Radix Dialog's portal finishes mounting.
beforeAll(async () => {
  const { unmount } = render(<PdfViewer pdfUrl="/warm-up.pdf" />);
  await screen.findByTestId('pdf-page-0', {}, { timeout: 3000 }).catch(() => {});
  unmount();
});

describe('SignatureDialog with placements', () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    signatureRecord: {
      id: 'sig-1',
      documentName: 'Contract.pdf',
      requesterName: 'HR Admin',
      placements: JSON.stringify([
        { pageIndex: 0, x: 100, y: 200, width: 150, height: 50 },
      ]),
    },
    onComplete: vi.fn(),
  };

  it('PSV-1: shows PDF viewer when placements exist', async () => {
    render(<SignatureDialog {...baseProps} />);
    // The Dialog should open and show the document name
    expect(screen.getByText('Contract.pdf')).toBeInTheDocument();
    // PdfViewer loads async — wait for the placement overlay
    const overlay = await screen.findByTestId('placement-0', {}, { timeout: 5000 });
    expect(overlay).toBeInTheDocument();
  });

  it('PSV-2: shows placement overlays with "Sign Here" labels', async () => {
    render(<SignatureDialog {...baseProps} />);
    await screen.findByTestId('placement-0', {}, { timeout: 3000 });
    expect(screen.getByText('Sign Here')).toBeInTheDocument();
  });

  it('PSV-3: shows signature pad alongside PDF', async () => {
    render(<SignatureDialog {...baseProps} />);
    // Wait for PDF viewer to load
    await screen.findByTestId('placement-0', {}, { timeout: 3000 });
    // Signature pad should be present — look for the Draw button (tab)
    const drawButtons = screen.getAllByText(/draw/i);
    // At least one should be the SignaturePad Draw tab button
    expect(drawButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('PSV-4: falls back to legacy dialog when no placements', () => {
    const noPlacementsRecord = {
      id: 'sig-2',
      documentName: 'Old Contract.pdf',
      requesterName: 'HR Admin',
      placements: null,
    };
    render(
      <SignatureDialog {...baseProps} signatureRecord={noPlacementsRecord} />,
    );
    // Should show the simple info-only view (no PDF viewer)
    expect(screen.getByText('Old Contract.pdf')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-page-0')).not.toBeInTheDocument();
  });

  it('PSV-5: Continue button is present', async () => {
    render(<SignatureDialog {...baseProps} />);
    expect(screen.getByText(/continue/i)).toBeInTheDocument();
  });
});
