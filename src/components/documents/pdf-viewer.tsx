"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SignaturePlacement } from "@/types/signature";

// Dynamically import pdfjs-dist to avoid SSR issues
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

interface PdfViewerProps {
  pdfUrl: string;
  placements?: SignaturePlacement[];
  onPlacementAdd?: (placement: SignaturePlacement) => void;
  onPlacementRemove?: (index: number) => void;
  editable?: boolean;
  signatureImageUrl?: string;
}

interface PageInfo {
  pageIndex: number;
  width: number;
  height: number;
}

const DEFAULT_PLACEMENT_WIDTH = 150;
const DEFAULT_PLACEMENT_HEIGHT = 50;
const SCALE = 1.5; // Render at 1.5x for sharpness

export function PdfViewer({
  pdfUrl,
  placements = [],
  onPlacementAdd,
  onPlacementRemove,
  editable = false,
  signatureImageUrl,
}: PdfViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pdfDocRef = useRef<any>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        if (!pdfjsLib) {
          pdfjsLib = await import("pdfjs-dist");
          // Set worker source — use CDN to avoid webpack complexity
          const version = (pdfjsLib as any).version || "4.0.379";
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
        }

        // Fetch PDF with credentials (cookies) since the API route requires auth,
        // then pass the data directly to pdfjs-dist
        const response = await fetch(pdfUrl, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        const pageInfos: PageInfo[] = [];

        for (let i = 0; i < doc.numPages; i++) {
          const page = await doc.getPage(i + 1); // pdfjs uses 1-based page numbers
          const viewport = page.getViewport({ scale: 1 });
          pageInfos.push({
            pageIndex: i,
            width: viewport.width,
            height: viewport.height,
          });
        }

        if (!cancelled) {
          setPages(pageInfos);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load PDF");
          setLoading(false);
        }
      }
    }

    setLoading(true);
    setError(null);
    loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDocRef.current || pages.length === 0) return;

    async function renderPage() {
      const doc = pdfDocRef.current;
      const page = await doc.getPage(currentPage + 1);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = canvasRefs.current.get(currentPage);
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
    }

    renderPage();
  }, [currentPage, pages]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => {
      if (!editable || !onPlacementAdd) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert from canvas pixels to PDF points
      const pageInfo = pages[pageIndex];
      if (!pageInfo) return;

      const pdfX = clickX / (rect.width / pageInfo.width);
      const pdfYFromTop = clickY / (rect.height / pageInfo.height);
      const pdfY = pageInfo.height - pdfYFromTop - DEFAULT_PLACEMENT_HEIGHT;

      onPlacementAdd({
        pageIndex,
        x: Math.max(0, Math.min(pdfX, pageInfo.width - DEFAULT_PLACEMENT_WIDTH)),
        y: Math.max(0, Math.min(pdfY, pageInfo.height - DEFAULT_PLACEMENT_HEIGHT)),
        width: DEFAULT_PLACEMENT_WIDTH,
        height: DEFAULT_PLACEMENT_HEIGHT,
      });
    },
    [editable, onPlacementAdd, pages],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mr-2" />
        Loading PDF...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500">
        Failed to load PDF: {error}
      </div>
    );
  }

  const pageInfo = pages[currentPage];
  if (!pageInfo) return null;

  // Placements for the current page
  const currentPlacements = placements.filter((p) => p.pageIndex === currentPage);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Page navigation */}
      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
        <button
          type="button"
          disabled={currentPage === 0}
          onClick={() => setCurrentPage((p) => p - 1)}
          className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-charcoal-800"
        >
          Prev
        </button>
        <span>Page {currentPage + 1} of {pages.length}</span>
        <button
          type="button"
          disabled={currentPage === pages.length - 1}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="px-2 py-1 border rounded disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-charcoal-800"
        >
          Next
        </button>
      </div>

      {/* PDF page with placement overlays */}
      <div className="relative border border-gray-300 dark:border-charcoal-600 bg-white shadow-sm inline-block">
        <canvas
          ref={(el) => { if (el) canvasRefs.current.set(currentPage, el); }}
          data-testid={`pdf-page-${currentPage}`}
          onClick={(e) => handleCanvasClick(e, currentPage)}
          className={editable ? "cursor-crosshair" : "cursor-default"}
          style={{ width: pageInfo.width * SCALE, height: pageInfo.height * SCALE }}
        />

        {/* Placement overlays */}
        {currentPlacements.map((p) => {
          const globalIdx = placements.indexOf(p);
          // Convert from PDF points (bottom-left origin) to CSS pixels (top-left origin)
          const cssLeft = p.x * SCALE;
          const cssTop = (pageInfo.height - p.y - p.height) * SCALE;
          const cssWidth = p.width * SCALE;
          const cssHeight = p.height * SCALE;

          return (
            <div
              key={globalIdx}
              data-testid={`placement-${globalIdx}`}
              className="absolute border-2 border-dashed border-blue-500 bg-blue-50/30 flex items-center justify-center"
              style={{
                left: cssLeft,
                top: cssTop,
                width: cssWidth,
                height: cssHeight,
              }}
            >
              {signatureImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureImageUrl} alt="Signature" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-blue-600 font-medium">
                  {p.label || "Sign Here"}
                </span>
              )}

              {editable && onPlacementRemove && (
                <button
                  type="button"
                  data-testid={`remove-placement-${globalIdx}`}
                  onClick={(e) => { e.stopPropagation(); onPlacementRemove(globalIdx); }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                >
                  X
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
