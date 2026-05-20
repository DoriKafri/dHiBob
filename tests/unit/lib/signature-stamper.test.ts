import { describe, it, expect } from 'vitest';
import { stampSignature } from '@/lib/signature-stamper';
import { PDFDocument } from 'pdf-lib';
import type { SignaturePlacement } from '@/types/signature';

// Create a minimal valid PDF for testing
async function createMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]); // US Letter
  return doc.save();
}

// Create a minimal 1x1 white PNG (smallest valid PNG)
function createMinimalPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

describe('stampSignature', () => {
  it('returns a valid PDF with more bytes than input', async () => {
    const pdf = await createMinimalPdf();
    const png = createMinimalPng();

    const result = await stampSignature(pdf, png, {
      signerName: 'Test User',
      signedAt: new Date('2026-01-15'),
    });

    // Result should be a Uint8Array
    expect(result).toBeInstanceOf(Uint8Array);

    // Result should be larger (has the image + text embedded)
    expect(result.length).toBeGreaterThan(pdf.length);

    // Result should start with PDF header
    const header = new TextDecoder().decode(result.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('stamps on the last page by default', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const pdf = await doc.save();
    const png = createMinimalPng();

    const result = await stampSignature(pdf, png, {
      signerName: 'Multi Page Signer',
      signedAt: new Date('2026-03-01'),
    });

    // Should succeed without error (stamps on page index 1 = last page)
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(pdf.length);
  });

  it('stamps on a specific page when pageIndex is provided', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const pdf = await doc.save();
    const png = createMinimalPng();

    const result = await stampSignature(pdf, png, {
      signerName: 'Page 0 Signer',
      signedAt: new Date('2026-03-01'),
      pageIndex: 0,
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(pdf.length);
  });

  it('throws for out-of-range pageIndex', async () => {
    const pdf = await createMinimalPdf();
    const png = createMinimalPng();

    await expect(
      stampSignature(pdf, png, {
        signerName: 'Bad Index',
        signedAt: new Date(),
        pageIndex: 5,
      }),
    ).rejects.toThrow('Page index 5 out of range');
  });

  it('stamps at multiple placements when provided', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const pdf = await doc.save();
    const png = createMinimalPng();

    const placements: SignaturePlacement[] = [
      { pageIndex: 0, x: 100, y: 100, width: 150, height: 50 },
      { pageIndex: 1, x: 200, y: 200, width: 150, height: 50 },
    ];

    const result = await stampSignature(pdf, png, {
      signerName: 'Multi Signer',
      signedAt: new Date('2026-05-01'),
      placements,
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(pdf.length);

    // Verify the result is a valid PDF
    const header = new TextDecoder().decode(result.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('uses explicit coordinates when provided (no placements array)', async () => {
    const pdf = await createMinimalPdf();
    const png = createMinimalPng();

    const result = await stampSignature(pdf, png, {
      signerName: 'Explicit Coords',
      signedAt: new Date('2026-05-01'),
      pageIndex: 0,
      x: 50,
      y: 300,
      width: 100,
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(pdf.length);
  });

  it('falls back to default position when no placements and no explicit coords', async () => {
    const pdf = await createMinimalPdf();
    const png = createMinimalPng();

    const result = await stampSignature(pdf, png, {
      signerName: 'Default Position',
      signedAt: new Date('2026-05-01'),
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(pdf.length);
  });

  it('throws for out-of-range pageIndex in placements array', async () => {
    const pdf = await createMinimalPdf();
    const png = createMinimalPng();

    const placements: SignaturePlacement[] = [
      { pageIndex: 99, x: 100, y: 100, width: 150, height: 50 },
    ];

    await expect(
      stampSignature(pdf, png, {
        signerName: 'Bad Placement',
        signedAt: new Date(),
        placements,
      }),
    ).rejects.toThrow('Page index 99 out of range');
  });
});
