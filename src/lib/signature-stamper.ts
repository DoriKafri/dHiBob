/**
 * Server-side PDF signature stamper using pdf-lib.
 *
 * Takes a PDF and a signature image (PNG) and stamps the signature
 * onto the specified page with a text annotation.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { SignaturePlacement } from '@/types/signature';

export interface StampOptions {
  /** Zero-based page index. Default: last page. */
  pageIndex?: number;
  /** X coordinate (from left). Default: centered. */
  x?: number;
  /** Y coordinate (from bottom). Default: bottom quarter. */
  y?: number;
  /** Signature image width. Default: 200. */
  width?: number;
  /** Signer's display name. */
  signerName: string;
  /** Date/time of signing. */
  signedAt: Date;
  /** Multiple placement positions. If provided, overrides pageIndex/x/y/width. */
  placements?: SignaturePlacement[];
}

/**
 * Stamp a signature image onto a PDF and return the new PDF bytes.
 *
 * The original PDF bytes are not mutated — a new copy is returned.
 */
export async function stampSignature(
  pdfBytes: Uint8Array,
  signatureImagePng: Uint8Array,
  options: StampOptions,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  if (pages.length === 0) {
    throw new Error('PDF has no pages');
  }

  const sigImage = await pdfDoc.embedPng(signatureImagePng);
  const sigAspect = sigImage.width / sigImage.height;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const dateStr = options.signedAt.toISOString().split('T')[0];
  const annotation = `${options.signerName} — Signed ${dateStr}`;
  const fontSize = 8;

  if (options.placements && options.placements.length > 0) {
    // Multi-placement mode: stamp at each specified position
    for (const placement of options.placements) {
      if (placement.pageIndex < 0 || placement.pageIndex >= pages.length) {
        throw new Error(`Page index ${placement.pageIndex} out of range (0..${pages.length - 1})`);
      }
      const page = pages[placement.pageIndex];
      const sigWidth = placement.width;
      const sigHeight = placement.height || sigWidth / sigAspect;

      page.drawImage(sigImage, {
        x: placement.x,
        y: placement.y,
        width: sigWidth,
        height: sigHeight,
      });
    }

    // Draw annotation text below the last placement
    const lastPlacement = options.placements[options.placements.length - 1];
    const lastPage = pages[lastPlacement.pageIndex];
    const textWidth = font.widthOfTextAtSize(annotation, fontSize);
    const textX = lastPlacement.x + (lastPlacement.width - textWidth) / 2;
    const textY = lastPlacement.y - fontSize - 4;

    lastPage.drawText(annotation, {
      x: Math.max(textX, 10),
      y: Math.max(textY, 10),
      size: fontSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  } else {
    // Legacy single-placement mode (backward compatible)
    const pageIdx = options.pageIndex ?? pages.length - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) {
      throw new Error(`Page index ${pageIdx} out of range (0..${pages.length - 1})`);
    }

    const page = pages[pageIdx];
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const sigWidth = options.width ?? 200;
    const sigHeight = sigWidth / sigAspect;
    const sigX = options.x ?? (pageWidth - sigWidth) / 2;
    const sigY = options.y ?? pageHeight * 0.15;

    page.drawImage(sigImage, { x: sigX, y: sigY, width: sigWidth, height: sigHeight });

    const textWidth = font.widthOfTextAtSize(annotation, fontSize);
    const textX = sigX + (sigWidth - textWidth) / 2;
    const textY = sigY - fontSize - 4;

    page.drawText(annotation, {
      x: Math.max(textX, 10),
      y: Math.max(textY, 10),
      size: fontSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  return pdfDoc.save();
}
