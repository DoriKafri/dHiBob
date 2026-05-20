/**
 * Describes where a signature should be placed on a PDF page.
 * Coordinates use pdf-lib convention: origin at bottom-left, Y increases upward.
 * Units are PDF points (1 point = 1/72 inch).
 */
export interface SignaturePlacement {
  /** Zero-based page index */
  pageIndex: number;
  /** X coordinate in PDF points (from left edge of page) */
  x: number;
  /** Y coordinate in PDF points (from bottom edge of page) */
  y: number;
  /** Width of the signature box in PDF points */
  width: number;
  /** Height of the signature box in PDF points */
  height: number;
  /** Optional label (e.g., "Initial", "Full Signature") */
  label?: string;
}
