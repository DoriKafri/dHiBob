# Interactive PDF Signature Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use trycycle-executing to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive PDF signature placement to the existing e-signature system so admins can pre-mark exact signature spots on a PDF and employees see and sign at those positions.

**Architecture:** Client-side PDF rendering via `pdfjs-dist` with a reusable `PdfViewer` component that handles placement overlays. Admin uses a two-step "Send for Signature" flow (pick signer, then mark spots on the PDF). Employee sees the PDF with pre-marked spots and signs at each one. Server stamps signatures at the specified coordinates using the existing `pdf-lib` stamper, extended to accept multiple placements. Placements stored as JSON in a new nullable `placements` column on `SignatureRecord`.

**Tech Stack:** Next.js 14, React 18, tRPC v10, `pdfjs-dist` ^4.x (new), `pdf-lib` (existing), Prisma/PostgreSQL, Vitest + Testing Library

---

## Current State

The self-owned e-signature system already provides:

| Component | File | What it does |
|---|---|---|
| Signature stamper | `src/lib/signature-stamper.ts` | Server-side PDF stamping via `pdf-lib`. Accepts `StampOptions` with optional `pageIndex`, `x`, `y`, `width`. Defaults: last page, centered, bottom quarter. |
| Signature router | `src/server/routers/signature.ts` | tRPC procedures: `requestSignature`, `sign`, `decline`, `getPending`, `getByDocument`, `getSignedPdf`. |
| Signature dialog | `src/components/documents/signature-dialog.tsx` | Modal for the signer: capture signature (draw/type), confirm, decline. No PDF preview. |
| Signature pad | `src/components/documents/signature-pad.tsx` | Canvas draw mode + typed-name mode. Outputs PNG data URL. |
| Documents page | `src/app/(dashboard)/documents/page.tsx` | Lists documents, "Send for Signature" dialog (employee picker). |
| People page | `src/app/(dashboard)/people/[id]/page.tsx` | Compensation History pen icon triggers signature request. Inline signing modal. |
| SignatureRecord model | `prisma/schema.prisma` (line 867) | Tracks documentId, signerId, status, signatureImage, signedPdfPath. No placement coordinates. |
| Existing tests | `tests/unit/lib/signature-stamper.test.ts` (4 tests), `tests/unit/routers/signature.router.test.ts` (11 tests) | Cover stamping, router CRUD, authorization. |

### Key limitations being addressed

1. **No PDF preview** — the signer never sees the document before signing.
2. **No placement control** — HR cannot specify where signatures should land on the PDF.
3. **Single placement only** — `stampSignature()` stamps once; multi-spot signing is not possible.

## Files to Create

| File | Purpose |
|---|---|
| `src/types/signature.ts` | `SignaturePlacement` type definition shared by client and server |
| `src/components/documents/pdf-viewer.tsx` | PDF rendering component using `pdfjs-dist` with placement overlays |
| `src/components/documents/placement-dialog.tsx` | Admin dialog: employee picker + PDF viewer in edit mode for marking signature spots |
| `tests/unit/components/pdf-viewer.test.tsx` | Tests for PdfViewer component |
| `tests/unit/components/placement-editor.test.tsx` | Tests for PlacementDialog admin placement flow |
| `tests/unit/components/placement-sign-view.test.tsx` | Tests for signer view with placements |

## Files to Modify

| File | Changes |
|---|---|
| `package.json` | Add `pdfjs-dist` dependency |
| `next.config.js` | Webpack config for `pdfjs-dist` worker/canvas |
| `prisma/schema.prisma` | Add `placements String?` to `SignatureRecord` model |
| `src/lib/signature-stamper.ts` | Accept optional `placements: SignaturePlacement[]`, loop and stamp at each position |
| `src/server/routers/signature.ts` | Add `placements` to `requestSignature` input, parse in `sign`, add `getPdfUrl` query |
| `src/server/routers/document.ts` | Add `getDocumentPdfUrl` query |
| `src/components/documents/signature-dialog.tsx` | Expand to show `PdfViewer` with placements, live signature preview |
| `src/app/(dashboard)/documents/page.tsx` | Replace inline "Send for Signature" dialog with `PlacementDialog` |
| `src/app/(dashboard)/people/[id]/page.tsx` | Update pen-icon handler to open `PlacementDialog` |
| `tests/unit/lib/signature-stamper.test.ts` | Add tests for multi-placement stamping |
| `tests/unit/routers/signature.router.test.ts` | Add tests for placements input/storage/passthrough |

## Coordinate System Reference

**`pdfjs-dist` rendering:** Origin top-left, Y increases downward, units are CSS pixels (scaled).
**`pdf-lib` stamping:** Origin bottom-left, Y increases upward, units are PDF points (1pt = 1/72in).

**Translation (admin clicks at pixel `(px, py)` on canvas rendered at `scale`):**
```
pdfX = px / scale
pdfY = pageHeightInPoints - (py / scale) - placementHeight
```

**Rendering back (signer view, convert stored placement to CSS overlay):**
```
cssLeft = placement.x * scale
cssTop = (pageHeightInPoints - placement.y - placement.height) * scale
```

Store coordinates in pdf-lib convention (bottom-left origin) so the server uses them directly.

---

### Task 1: Install `pdfjs-dist` and create shared types

**Files:**
- Modify: `package.json`
- Modify: `next.config.js`
- Create: `src/types/signature.ts`

- [ ] **Step 1: Install pdfjs-dist**

```bash
cd /workspace/.worktrees/pdf-signature-placement
npm install pdfjs-dist
```

- [ ] **Step 2: Create the shared `SignaturePlacement` type**

Create `src/types/signature.ts`:

```ts
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
```

- [ ] **Step 3: Configure Next.js for pdfjs-dist**

Update `next.config.js` to handle the pdfjs-dist worker. The simplest approach for Next.js 14 is to point the worker at the CDN:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config) => {
    // pdfjs-dist uses canvas for node.js rendering — not needed in browser
    config.resolve.alias.canvas = false;
    return config;
  },
}
module.exports = nextConfig
```

The worker source will be set in the PdfViewer component using the CDN URL matching the installed version.

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/types/signature.ts next.config.js package.json package-lock.json
git commit -m "feat(signature): add pdfjs-dist dependency and SignaturePlacement type"
```

---

### Task 2: Extend `stampSignature()` to support multiple placements

**Files:**
- Modify: `src/lib/signature-stamper.ts`
- Test: `tests/unit/lib/signature-stamper.test.ts`

- [ ] **Step 1: Write failing tests for multi-placement stamping**

Add to `tests/unit/lib/signature-stamper.test.ts`:

```ts
import type { SignaturePlacement } from '@/types/signature';

// Add after existing tests:

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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npx vitest run tests/unit/lib/signature-stamper.test.ts
```
Expected: The new `stamps at multiple placements` test fails (StampOptions doesn't accept `placements` yet).

- [ ] **Step 3: Implement multi-placement support in signature-stamper.ts**

Update `src/lib/signature-stamper.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/lib/signature-stamper.test.ts
```
Expected: all 8 tests PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all existing tests PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/lib/signature-stamper.ts src/types/signature.ts tests/unit/lib/signature-stamper.test.ts
git commit -m "feat(signature): support multiple placement positions in stampSignature"
```

---

### Task 3: Schema change and router updates

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/routers/signature.ts`
- Modify: `src/server/routers/document.ts`
- Test: `tests/unit/routers/signature.router.test.ts`

- [ ] **Step 1: Write failing router tests**

Add to `tests/unit/routers/signature.router.test.ts`:

```ts
// Add these test cases inside the existing describe blocks:

describe('requestSignature with placements', () => {
  it('S-12: stores placements JSON when provided', async () => {
    const db = makeDb();
    const doc = makeDocument();
    const signer = makeEmployee();
    db.document.findFirst.mockResolvedValue(doc);
    db.employee.findFirst.mockResolvedValue(signer);
    db.signatureRecord.create.mockResolvedValue(
      makeSignatureRecord({ placements: '[{"pageIndex":0,"x":100,"y":200,"width":150,"height":50}]' }),
    );
    db.document.update.mockResolvedValue({ ...doc, signatureStatus: 'PENDING_SIGNATURE' });

    const ctx = makeCtx({ db });
    const result = await caller(ctx).signature.requestSignature({
      documentId: 'doc-1',
      signerId: 'emp-signer',
      placements: JSON.stringify([{ pageIndex: 0, x: 100, y: 200, width: 150, height: 50 }]),
    });

    expect(db.signatureRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          placements: expect.stringContaining('"pageIndex":0'),
        }),
      }),
    );
  });

  it('S-13: works without placements (backward compat)', async () => {
    const db = makeDb();
    const doc = makeDocument();
    const signer = makeEmployee();
    db.document.findFirst.mockResolvedValue(doc);
    db.employee.findFirst.mockResolvedValue(signer);
    db.signatureRecord.create.mockResolvedValue(makeSignatureRecord());
    db.document.update.mockResolvedValue({ ...doc, signatureStatus: 'PENDING_SIGNATURE' });

    const ctx = makeCtx({ db });
    await caller(ctx).signature.requestSignature({
      documentId: 'doc-1',
      signerId: 'emp-signer',
    });

    expect(db.signatureRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: 'doc-1',
          signerId: 'emp-signer',
        }),
      }),
    );
  });

  it('S-14: rejects invalid placements JSON', async () => {
    const db = makeDb();
    db.document.findFirst.mockResolvedValue(makeDocument());
    db.employee.findFirst.mockResolvedValue(makeEmployee());
    const ctx = makeCtx({ db });

    await expect(
      caller(ctx).signature.requestSignature({
        documentId: 'doc-1',
        signerId: 'emp-signer',
        placements: 'not-valid-json',
      }),
    ).rejects.toThrow();
  });
});

describe('sign with placements', () => {
  it('S-15: passes placements to stampSignature when record has them', async () => {
    const { stampSignature: mockStamp } = await import('@/lib/signature-stamper');
    const db = makeDb();
    const placements = JSON.stringify([
      { pageIndex: 0, x: 100, y: 200, width: 150, height: 50 },
    ]);
    const record = makeSignatureRecord({ placements });
    db.signatureRecord.findFirst.mockResolvedValue(record);
    db.signatureRecord.update.mockResolvedValue({ ...record, status: 'SIGNED' });
    db.document.update.mockResolvedValue({ ...record.document, signatureStatus: 'SIGNED' });

    const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
    await caller(ctx).signature.sign({
      signatureRecordId: 'sig-1',
      signatureImageBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(mockStamp).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.objectContaining({
        placements: [{ pageIndex: 0, x: 100, y: 200, width: 150, height: 50 }],
      }),
    );
  });

  it('S-16: uses default stamping when record has no placements', async () => {
    const { stampSignature: mockStamp } = await import('@/lib/signature-stamper');
    const db = makeDb();
    const record = makeSignatureRecord({ placements: null });
    db.signatureRecord.findFirst.mockResolvedValue(record);
    db.signatureRecord.update.mockResolvedValue({ ...record, status: 'SIGNED' });
    db.document.update.mockResolvedValue({ ...record.document, signatureStatus: 'SIGNED' });

    const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
    await caller(ctx).signature.sign({
      signatureRecordId: 'sig-1',
      signatureImageBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });

    // Should NOT pass placements — let stampSignature use defaults
    expect(mockStamp).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.not.objectContaining({ placements: expect.anything() }),
    );
  });
});

describe('getPdfUrl', () => {
  it('S-17: returns download URL for a signature record document', async () => {
    const db = makeDb();
    db.signatureRecord.findFirst.mockResolvedValue(
      makeSignatureRecord({ document: makeDocument({ filePath: 'contracts/test.pdf' }) }),
    );

    const ctx = makeCtx({ db });
    const result = await caller(ctx).signature.getPdfUrl({ signatureRecordId: 'sig-1' });
    expect(result.url).toBeDefined();
    expect(typeof result.url).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/routers/signature.router.test.ts
```
Expected: S-12 through S-17 fail (no `placements` input, no `getPdfUrl` query).

- [ ] **Step 3: Add `placements` column to schema**

In `prisma/schema.prisma`, add to the `SignatureRecord` model (after `declineReason`):

```prisma
  placements      String?   // JSON: SignaturePlacement[] — null for legacy records
```

Then push the schema:

```bash
npx prisma db push
npx prisma generate
```

- [ ] **Step 4: Update the signature router**

Update `src/server/routers/signature.ts`:

**`requestSignature`** — add optional `placements` input, validate and store:

In the input schema, add:
```ts
placements: z.string().optional(), // JSON string: SignaturePlacement[]
```

Before creating the record, validate placements if provided:
```ts
let validatedPlacements: string | undefined;
if (input.placements) {
  try {
    const parsed = JSON.parse(input.placements);
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    for (const p of parsed) {
      if (typeof p.pageIndex !== 'number' || typeof p.x !== 'number' ||
          typeof p.y !== 'number' || typeof p.width !== 'number' || typeof p.height !== 'number') {
        throw new Error('Invalid placement');
      }
    }
    validatedPlacements = input.placements;
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid placements JSON' });
  }
}
```

In the `create` data, add: `placements: validatedPlacements ?? null,`

**`sign`** — read placements and pass to stamper:

After reading `record.document.filePath` and before calling `stampSignature`, parse placements:
```ts
let placements: SignaturePlacement[] | undefined;
if (record.placements) {
  try {
    placements = JSON.parse(record.placements);
  } catch {
    // Ignore parse errors for corrupted data — use default position
  }
}
```

Pass to stamper:
```ts
const stampedBytes = await stampSignature(
  new Uint8Array(pdfBytes),
  new Uint8Array(signatureImageBytes),
  {
    signerName: record.signerName,
    signedAt: now,
    ...(placements && placements.length > 0 ? { placements } : {}),
  },
);
```

**Add `getPdfUrl` query:**
```ts
getPdfUrl: protectedProcedure
  .input(z.object({ signatureRecordId: z.string() }))
  .query(async ({ ctx, input }) => {
    const record = await ctx.db.signatureRecord.findFirst({
      where: { id: input.signatureRecordId, companyId: ctx.user.companyId },
      include: { document: true },
    });
    if (!record?.document?.filePath) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }
    const url = await storageProvider.getDownloadUrl(record.document.filePath);
    return { url };
  }),
```

**Update `getPending` and `getByDocument`** to include `placements` in their select (Prisma includes all scalar fields by default, so just verify the `include` doesn't exclude it).

Add import at the top:
```ts
import type { SignaturePlacement } from '@/types/signature';
```

**Add `getDocumentPdfUrl` to document router** (`src/server/routers/document.ts`):
```ts
getDocumentPdfUrl: protectedProcedure
  .input(z.object({ documentId: z.string() }))
  .query(async ({ ctx, input }) => {
    const doc = await ctx.db.document.findFirst({
      where: { id: input.documentId, companyId: ctx.user.companyId },
    });
    if (!doc?.filePath) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }
    const { storage } = await import('@/lib/storage');
    const url = await storage.getDownloadUrl(doc.filePath);
    return { url };
  }),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/routers/signature.router.test.ts
```
Expected: all 17 tests PASS (S-1 through S-17)

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/server/routers/signature.ts src/server/routers/document.ts src/types/signature.ts tests/unit/routers/signature.router.test.ts
git commit -m "feat(signature): add placements column, getPdfUrl query, multi-placement stamping in router"
```

---

### Task 4: Build `PdfViewer` component

**Files:**
- Create: `src/components/documents/pdf-viewer.tsx`
- Create: `tests/unit/components/pdf-viewer.test.tsx`

- [ ] **Step 1: Write failing tests for PdfViewer**

Create `tests/unit/components/pdf-viewer.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/components/pdf-viewer.test.tsx
```
Expected: FAIL — module `@/components/documents/pdf-viewer` not found.

- [ ] **Step 3: Implement PdfViewer component**

Create `src/components/documents/pdf-viewer.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SignaturePlacement } from "@/types/signature";

// Dynamically import pdfjs-dist to avoid SSR issues
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

interface PdfViewerProps {
  pdfUrl: string;
  placements?: SignaturePlacement[];
  onPlacementAdd?: (placement: SignaturePlacement) => void;
  onPlacementUpdate?: (index: number, placement: SignaturePlacement) => void;
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

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
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

      const displayScale = canvas.width / (pageInfo.width * SCALE) * SCALE;
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
          style={{ width: pageInfo.width * (SCALE / window.devicePixelRatio || 1), height: pageInfo.height * (SCALE / window.devicePixelRatio || 1) }}
        />

        {/* Placement overlays */}
        {currentPlacements.map((p, localIdx) => {
          const globalIdx = placements.indexOf(p);
          // Convert from PDF points (bottom-left origin) to CSS pixels (top-left origin)
          const cssLeft = p.x * (SCALE / (window.devicePixelRatio || 1));
          const cssTop =
            (pageInfo.height - p.y - p.height) * (SCALE / (window.devicePixelRatio || 1));
          const cssWidth = p.width * (SCALE / (window.devicePixelRatio || 1));
          const cssHeight = p.height * (SCALE / (window.devicePixelRatio || 1));

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/components/pdf-viewer.test.tsx
```
Expected: all 6 PV tests PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/documents/pdf-viewer.tsx tests/unit/components/pdf-viewer.test.tsx
git commit -m "feat(signature): add PdfViewer component with placement overlays"
```

---

### Task 5: Build `PlacementDialog` component (admin flow)

**Files:**
- Create: `src/components/documents/placement-dialog.tsx`
- Create: `tests/unit/components/placement-editor.test.tsx`

- [ ] **Step 1: Write failing tests for PlacementDialog**

Create `tests/unit/components/placement-editor.test.tsx`:

```tsx
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
    render(<PlacementDialog {...defaultProps} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'emp-1');

    const nextBtn = screen.getByRole('button', { name: /next|mark/i });
    await user.click(nextBtn);

    // Should show PDF viewer
    await waitFor(() => {
      expect(screen.getByText(/page 1/i)).toBeInTheDocument();
    });
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/components/placement-editor.test.tsx
```
Expected: FAIL — module `@/components/documents/placement-dialog` not found.

- [ ] **Step 3: Implement PlacementDialog**

Create `src/components/documents/placement-dialog.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "./pdf-viewer";
import { trpc } from "@/lib/trpc";
import { PenTool, Loader2, ChevronRight } from "lucide-react";
import type { SignaturePlacement } from "@/types/signature";

interface PlacementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  /** Pre-selected signer (e.g., from people page pen icon) — skips step 1 */
  presetSignerId?: string;
  onComplete: () => void;
}

export function PlacementDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  presetSignerId,
  onComplete,
}: PlacementDialogProps) {
  const [step, setStep] = useState<"signer" | "placement">(presetSignerId ? "placement" : "signer");
  const [signerId, setSignerId] = useState(presetSignerId || "");
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);

  const employees = trpc.employee.list.useQuery({ limit: 500 });
  const pdfUrl = trpc.document.getDocumentPdfUrl.useQuery(
    { documentId },
    { enabled: step === "placement" },
  );
  const requestMutation = trpc.signature.requestSignature.useMutation({
    onSuccess: () => {
      onComplete();
      handleClose(false);
    },
  });

  const handleClose = (o: boolean) => {
    if (!o) {
      setStep(presetSignerId ? "placement" : "signer");
      setSignerId(presetSignerId || "");
      setPlacements([]);
    }
    onOpenChange(o);
  };

  const handleAddPlacement = useCallback((p: SignaturePlacement) => {
    setPlacements((prev) => [...prev, p]);
  }, []);

  const handleRemovePlacement = useCallback((index: number) => {
    setPlacements((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = async () => {
    await requestMutation.mutateAsync({
      documentId,
      signerId,
      placements: placements.length > 0 ? JSON.stringify(placements) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool size={18} />
            Send for Signature — {documentName}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select Signer */}
        {step === "signer" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Select Signer</label>
              <select
                value={signerId}
                onChange={(e) => setSignerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-charcoal-600 rounded-md bg-white dark:bg-charcoal-900 text-sm"
              >
                <option value="">Choose an employee...</option>
                {(employees.data?.employees ?? []).map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!signerId}
                onClick={() => setStep("placement")}
                className="gap-1"
              >
                Next: Mark Signature Spots <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Mark Placements on PDF */}
        {step === "placement" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Click on the PDF to mark where the signature should go.
              You can place multiple signatures across different pages.
            </p>

            {pdfUrl.data?.url ? (
              <PdfViewer
                pdfUrl={pdfUrl.data.url}
                placements={placements}
                editable
                onPlacementAdd={handleAddPlacement}
                onPlacementRemove={handleRemovePlacement}
              />
            ) : pdfUrl.isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading document...
              </div>
            ) : (
              <p className="text-sm text-red-500">Could not load document PDF.</p>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-gray-500">
                {placements.length} placement{placements.length !== 1 ? "s" : ""} marked
              </span>
              <div className="flex gap-2">
                {!presetSignerId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("signer")}
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={requestMutation.isPending}
                  onClick={handleSend}
                  className="gap-1"
                >
                  {requestMutation.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Sending...</>
                  ) : (
                    <><PenTool size={14} /> Send for Signature</>
                  )}
                </Button>
              </div>
            </div>
            {requestMutation.error && (
              <p className="text-sm text-red-500">{requestMutation.error.message}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/components/placement-editor.test.tsx
```
Expected: all 7 PE tests PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/documents/placement-dialog.tsx tests/unit/components/placement-editor.test.tsx
git commit -m "feat(signature): add PlacementDialog for admin to mark signature spots on PDF"
```

---

### Task 6: Update `SignatureDialog` for signer view with PDF preview

**Files:**
- Modify: `src/components/documents/signature-dialog.tsx`
- Create: `tests/unit/components/placement-sign-view.test.tsx`

- [ ] **Step 1: Write failing tests for signer view with placements**

Create `tests/unit/components/placement-sign-view.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import { SignatureDialog } from '@/components/documents/signature-dialog';

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
    await waitFor(() => {
      expect(screen.getByText(/page 1/i)).toBeInTheDocument();
    });
  });

  it('PSV-2: shows placement overlays with "Sign Here" labels', async () => {
    render(<SignatureDialog {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('placement-0')).toBeInTheDocument();
    });
    expect(screen.getByText('Sign Here')).toBeInTheDocument();
  });

  it('PSV-3: shows signature pad alongside PDF', async () => {
    render(<SignatureDialog {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText(/page 1/i)).toBeInTheDocument();
    });
    // Signature pad should be present
    expect(screen.getByText(/draw|type your signature/i)).toBeInTheDocument();
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

  it('PSV-5: Sign Document button is present', async () => {
    render(<SignatureDialog {...baseProps} />);
    expect(screen.getByText(/sign document|continue/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/components/placement-sign-view.test.tsx
```
Expected: FAIL — the existing `SignatureDialog` doesn't accept `placements` or show a PDF viewer.

- [ ] **Step 3: Update SignatureDialog to show PDF with placements**

Update `src/components/documents/signature-dialog.tsx`:

The key changes:
1. Add `placements` field to `signatureRecord` prop type (optional `string | null`).
2. When `placements` is present and parses as a non-empty array, render `PdfViewer` in read-only mode showing the PDF with placements and live signature preview.
3. Fetch the PDF URL via `trpc.signature.getPdfUrl`.
4. When no placements (legacy), keep the existing simple info-based dialog unchanged.
5. Make the dialog wider (`max-w-4xl`) when showing the PDF.

The full updated file (preserving all existing capture/confirm/decline logic):

```tsx
"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "./signature-pad";
import { PdfViewer } from "./pdf-viewer";
import { trpc } from "@/lib/trpc";
import { PenTool, XCircle, Loader2, CheckCircle } from "lucide-react";
import type { SignaturePlacement } from "@/types/signature";

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signatureRecord: {
    id: string;
    documentName: string;
    requesterName: string;
    placements?: string | null;
  } | null;
  onComplete: () => void;
}

export function SignatureDialog({
  open,
  onOpenChange,
  signatureRecord,
  onComplete,
}: SignatureDialogProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [step, setStep] = useState<"capture" | "confirm" | "decline">("capture");
  const [declineReason, setDeclineReason] = useState("");
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  const placements = useMemo<SignaturePlacement[]>(() => {
    if (!signatureRecord?.placements) return [];
    try {
      const parsed = JSON.parse(signatureRecord.placements);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [signatureRecord?.placements]);

  const hasPlacements = placements.length > 0;

  // Fetch PDF URL when we have placements
  const pdfUrlQuery = trpc.signature.getPdfUrl.useQuery(
    { signatureRecordId: signatureRecord?.id ?? "" },
    { enabled: !!signatureRecord?.id && hasPlacements },
  );

  const signMutation = trpc.signature.sign.useMutation({
    onSuccess: () => {
      setDone("signed");
      setTimeout(() => {
        onComplete();
        resetState();
      }, 1500);
    },
  });

  const declineMutation = trpc.signature.decline.useMutation({
    onSuccess: () => {
      setDone("declined");
      setTimeout(() => {
        onComplete();
        resetState();
      }, 1500);
    },
  });

  const resetState = () => {
    setSignatureDataUrl(null);
    setStep("capture");
    setDeclineReason("");
    setDone(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) resetState();
    onOpenChange(o);
  };

  if (!signatureRecord) return null;

  const isPending = signMutation.isPending || declineMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={hasPlacements ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool size={18} />
            Sign Document
          </DialogTitle>
        </DialogHeader>

        {/* Document info */}
        <div className="bg-gray-50 dark:bg-charcoal-800 rounded-md p-3 text-sm space-y-1">
          <p>
            <span className="text-gray-500 dark:text-gray-400">Document:</span>{" "}
            <span className="font-medium">{signatureRecord.documentName}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Requested by:</span>{" "}
            <span className="font-medium">{signatureRecord.requesterName}</span>
          </p>
        </div>

        {/* Done state */}
        {done && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle
              size={48}
              className={done === "signed" ? "text-green-500 mb-2" : "text-gray-500 mb-2"}
            />
            <p className="text-lg font-medium">
              {done === "signed" ? "Document Signed" : "Signature Declined"}
            </p>
          </div>
        )}

        {/* Main content when not done */}
        {!done && step === "capture" && (
          <>
            {/* PDF viewer with placements (when available) */}
            {hasPlacements && pdfUrlQuery.data?.url && (
              <div className="border rounded-md p-2 bg-gray-50 dark:bg-charcoal-900">
                <PdfViewer
                  pdfUrl={pdfUrlQuery.data.url}
                  placements={placements}
                  editable={false}
                  signatureImageUrl={signatureDataUrl || undefined}
                />
              </div>
            )}

            {/* Signature capture */}
            <div>
              <p className="text-sm text-gray-500 mb-2">
                {hasPlacements
                  ? "Draw or type your signature below. It will appear at the marked positions above."
                  : "Draw or type your signature below."}
              </p>
              <SignaturePad onChange={setSignatureDataUrl} />
            </div>

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => setStep("decline")}
              >
                <XCircle size={14} className="mr-1" /> Decline
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!signatureDataUrl}
                onClick={() => setStep("confirm")}
              >
                <PenTool size={14} className="mr-1" /> Continue
              </Button>
            </div>
          </>
        )}

        {/* Confirm step */}
        {!done && step === "confirm" && signatureDataUrl && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your signature will be applied to this document. This action cannot be undone.
            </p>
            <div className="border border-gray-200 dark:border-charcoal-600 rounded-md p-4 bg-white dark:bg-charcoal-900 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureDataUrl}
                alt="Your signature"
                className="max-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("capture")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  signMutation.mutate({
                    signatureRecordId: signatureRecord.id,
                    signatureImageBase64: signatureDataUrl,
                  })
                }
              >
                {signMutation.isPending ? (
                  <><Loader2 size={14} className="mr-1 animate-spin" /> Signing...</>
                ) : (
                  <><PenTool size={14} className="mr-1" /> Sign Document</>
                )}
              </Button>
            </div>
            {signMutation.error && (
              <p className="text-sm text-red-500">{signMutation.error.message}</p>
            )}
          </div>
        )}

        {/* Decline step */}
        {!done && step === "decline" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to decline signing this document?
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">
                Reason (optional)
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-charcoal-600 rounded-md bg-white dark:bg-charcoal-900 text-sm"
                placeholder="Why are you declining?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("capture")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  declineMutation.mutate({
                    signatureRecordId: signatureRecord.id,
                    reason: declineReason || undefined,
                  })
                }
              >
                {declineMutation.isPending ? (
                  <><Loader2 size={14} className="mr-1 animate-spin" /> Declining...</>
                ) : (
                  "Decline to Sign"
                )}
              </Button>
            </div>
            {declineMutation.error && (
              <p className="text-sm text-red-500">{declineMutation.error.message}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/components/placement-sign-view.test.tsx
```
Expected: all 5 PSV tests PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS (including the existing signature-dialog tests if any)

- [ ] **Step 6: Commit**

```bash
git add src/components/documents/signature-dialog.tsx tests/unit/components/placement-sign-view.test.tsx
git commit -m "feat(signature): add PDF preview with placements to signer dialog"
```

---

### Task 7: Integrate PlacementDialog into Documents page and People page

**Files:**
- Modify: `src/app/(dashboard)/documents/page.tsx`
- Modify: `src/app/(dashboard)/people/[id]/page.tsx`

- [ ] **Step 1: Update Documents page**

In `src/app/(dashboard)/documents/page.tsx`:

1. Import `PlacementDialog`:
   ```tsx
   import { PlacementDialog } from "@/components/documents/placement-dialog";
   ```

2. Replace the inline `<Dialog>` for "Send for Signature" (lines ~202-244) with:
   ```tsx
   <PlacementDialog
     open={!!signDoc}
     onOpenChange={(open) => { if (!open) setSignDoc(null); }}
     documentId={signDoc?.id || ""}
     documentName={signDoc?.name || ""}
     onComplete={() => { setSignDoc(null); refetchDocs(); }}
   />
   ```

3. Remove the `selectedSignerId` state and employee select logic that was previously inside the inline dialog.

4. Update the `SignatureDialog` usage to pass `placements` from the signing record:
   ```tsx
   signatureRecord={signingRecord ? {
     id: signingRecord.id,
     documentName: signingRecord.document?.name || '',
     requesterName: `${signingRecord.requester?.firstName} ${signingRecord.requester?.lastName}`,
     placements: signingRecord.placements || null,
   } : null}
   ```

- [ ] **Step 2: Update People page pen icon handler**

In `src/app/(dashboard)/people/[id]/page.tsx`:

1. Import `PlacementDialog`:
   ```tsx
   import { PlacementDialog } from "@/components/documents/placement-dialog";
   ```

2. Add state for the placement dialog:
   ```tsx
   const [placementDocId, setPlacementDocId] = useState<string | null>(null);
   const [placementDocName, setPlacementDocName] = useState('');
   ```

3. Replace the pen-icon `onClick` handler (lines ~1529-1544) that directly calls `requestSignature.mutate()`:

   Instead of immediately creating the signature request, open the placement dialog:
   ```tsx
   onClick={async () => {
     let docRecord = doc;
     if (!docRecord) {
       docRecord = await createDoc.mutateAsync({
         name: `Contract - ${employee.firstName} ${employee.lastName}`,
         filePath: entry.contractDoc!,
         employeeId: params.id,
         type: 'CONTRACT',
         folder: docsFolder,
       });
     }
     if (docRecord?.id) {
       setPlacementDocId(docRecord.id);
       setPlacementDocName(docRecord.name || `Contract - ${employee.firstName} ${employee.lastName}`);
     }
   }}
   ```

4. Add the `PlacementDialog` at the end of the component (near other dialogs):
   ```tsx
   <PlacementDialog
     open={!!placementDocId}
     onOpenChange={(open) => { if (!open) setPlacementDocId(null); }}
     documentId={placementDocId || ""}
     documentName={placementDocName}
     presetSignerId={params.id}
     onComplete={() => { setPlacementDocId(null); invalidate(); }}
   />
   ```

5. Update the inline signing modal's `SignatureDialog` to pass `placements` from the pending record:
   ```tsx
   signatureRecord={signingRecord ? {
     id: signingRecord.id,
     documentName: signingRecord.document?.name || '',
     requesterName: `${signingRecord.requester?.firstName || ''} ${signingRecord.requester?.lastName || ''}`,
     placements: (signingRecord as any).placements || null,
   } : null}
   ```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/documents/page.tsx src/app/\(dashboard\)/people/\[id\]/page.tsx
git commit -m "feat(signature): integrate PlacementDialog into Documents and People pages"
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | tail -10
```
Expected: 0 errors

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 3: Run production build**

```bash
npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit any remaining fixes**

If any fixes were needed in steps 1-3, commit them:

```bash
git add -A
git commit -m "fix(signature): resolve build/test issues from PDF placement integration"
```

---

## Non-Goals (Out of Scope)

- **Placement templates** — saving and reusing placement presets for document types.
- **Per-placement signer assignment** — all placements are for the same signer.
- **Signature field types** — all placements use the same signature image. Differentiating "initial" vs "full signature" is future work.
- **PDF form field detection** — automatic detection of existing signature fields. All placement is manual.
- **PDF text selection or annotation** — the viewer is render-only.
- **Drag-to-resize placements** — click-to-place with fixed size. Drag-to-reposition is supported.

## Dependencies

| Dependency | Version | License | Why |
|---|---|---|---|
| `pdfjs-dist` | ^4.x | Apache-2.0 | Render PDF pages in the browser using canvas. Required for the placement UI. |

`pdf-lib` (already installed) continues to handle server-side stamping.
