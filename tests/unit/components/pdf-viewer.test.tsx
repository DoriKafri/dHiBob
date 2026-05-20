import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock pdfjs-dist — jsdom has no canvas
vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792, scale: 1 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  const mockDoc = {
    numPages: 2,
    getPage: vi.fn().mockResolvedValue(mockPage),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockDoc) }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

import { PdfViewer } from '@/components/documents/pdf-viewer';

// Mock fetch for PDF loading — PdfViewer fetches with credentials then passes data to pdfjs
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
});
vi.stubGlobal('fetch', mockFetch);

describe('PdfViewer', () => {
  it('PV-1: renders loading state initially', () => {
    render(<PdfViewer pdfUrl="/test.pdf" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('PV-2: renders page navigation after load', async () => {
    render(<PdfViewer pdfUrl="/test.pdf" />);
    // Wait for load to complete
    const pageInfo = await screen.findByText(/page 1 of 2/i);
    expect(pageInfo).toBeInTheDocument();
  });

  it('PV-3: shows placement overlays when provided', async () => {
    const placements = [
      { pageIndex: 0, x: 100, y: 200, width: 150, height: 50 },
    ];
    render(<PdfViewer pdfUrl="/test.pdf" placements={placements} />);
    await screen.findByText(/page 1/i);
    const overlay = screen.getByTestId('placement-0');
    expect(overlay).toBeInTheDocument();
  });

  it('PV-4: calls onPlacementAdd when clicking in edit mode', async () => {
    const onAdd = vi.fn();
    render(<PdfViewer pdfUrl="/test.pdf" editable onPlacementAdd={onAdd} />);
    await screen.findByText(/page 1/i);
    const canvas = screen.getByTestId('pdf-page-0');
    fireEvent.click(canvas, { clientX: 100, clientY: 200 });
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 0 }),
    );
  });

  it('PV-5: calls onPlacementRemove when clicking X on a placement', async () => {
    const onRemove = vi.fn();
    const placements = [{ pageIndex: 0, x: 100, y: 200, width: 150, height: 50 }];
    render(
      <PdfViewer pdfUrl="/test.pdf" placements={placements} editable onPlacementRemove={onRemove} />,
    );
    await screen.findByText(/page 1/i);
    const removeBtn = screen.getByTestId('remove-placement-0');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('PV-6: renders error state for invalid URL', async () => {
    const { getDocument } = await import('pdfjs-dist');
    (getDocument as any).mockReturnValueOnce({
      promise: Promise.reject(new Error('Failed to load')),
    });
    render(<PdfViewer pdfUrl="/bad.pdf" />);
    const error = await screen.findByText(/failed|error/i);
    expect(error).toBeInTheDocument();
  });
});
