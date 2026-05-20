# Test Plan: Interactive PDF Signature Placement

## Harness Requirements

### 1. pdfjs-dist jsdom mock harness
- **What it does:** Provides a fake `pdfjs-dist` module for jsdom tests since jsdom has no canvas rendering. Returns mock page objects with viewport dimensions and a resolved render promise.
- **What it exposes:** `getDocument()` returning a mock document with `numPages` and `getPage()`, each page with `getViewport()` and `render()`.
- **Estimated complexity:** Low — 10 lines of mock factory. Already specified in the plan and reused across 3 test files.
- **Depends on it:** PV-1 through PV-6, PE-1 through PE-7, PSV-1 through PSV-5.

### 2. Signature router mock harness (existing, to extend)
- **What it does:** Provides Prisma mock factories (`makeDb`, `makeDocument`, `makeEmployee`, `makeSignatureRecord`) and a `caller` that creates a tRPC caller against the real router with mocked DB.
- **What it exposes:** `caller(ctx).signature.<procedure>()` for unit-testing router logic.
- **Estimated complexity:** Already built. Needs `placements` field added to `makeSignatureRecord`, and `getPdfUrl` mock chain added.
- **Depends on it:** S-12 through S-17.

### 3. tRPC client mock harness (existing pattern, to replicate)
- **What it does:** Mocks `@/lib/trpc` so component tests can supply canned tRPC query/mutation return values without a live server.
- **What it exposes:** `trpc.<router>.<procedure>.useQuery/useMutation` returning `{ data, isLoading, mutate, mutateAsync }`.
- **Estimated complexity:** Low — already used in dozens of existing component test files (people, hiring, analytics, etc.). Replicated per test file.
- **Depends on it:** PE-1 through PE-7, PSV-1 through PSV-5.

---

## Test Plan

Tests are numbered in priority order per the prioritization rules: existing checks first, then new integration/scenario tests closing gaps, then boundary/edge cases, then unit tests.

---

### T-01: Multi-placement stamping produces a valid PDF

- **Name:** Stamping at two positions on two different pages returns a valid larger PDF
- **Type:** integration
- **Disposition:** new
- **Harness:** Direct Vitest — `pdf-lib` PDFDocument creation + real `stampSignature` call
- **Preconditions:** A two-page PDF created via `PDFDocument.create()`, a minimal 1x1 PNG, and two `SignaturePlacement` entries targeting page 0 and page 1.
- **Actions:** Call `stampSignature(pdf, png, { signerName, signedAt, placements })`.
- **Expected outcome:** Returns a `Uint8Array` starting with `%PDF-` header, larger than input (source of truth: implementation plan Task 2 specifying multi-placement loop). Two images are embedded (one per placement).
- **Interactions:** `pdf-lib` PDFDocument load/save, PNG embedding.

### T-02: Explicit single-position coords (no placements array) still work

- **Name:** Providing pageIndex/x/y/width without a placements array stamps at those coordinates
- **Type:** regression
- **Disposition:** new
- **Harness:** Direct Vitest — real `stampSignature`
- **Preconditions:** Single-page PDF, minimal PNG.
- **Actions:** Call `stampSignature(pdf, png, { signerName, signedAt, pageIndex: 0, x: 50, y: 300, width: 100 })`.
- **Expected outcome:** Returns valid `Uint8Array` larger than input. Source of truth: existing behavior preserved per plan Task 2 "Legacy single-placement mode (backward compatible)".
- **Interactions:** `pdf-lib` image drawing at explicit coords.

### T-03: Default stamping position when no coords and no placements

- **Name:** Calling stampSignature with only signerName/signedAt stamps at the default bottom-center position
- **Type:** regression
- **Disposition:** existing (extends current test coverage pattern)
- **Harness:** Direct Vitest — real `stampSignature`
- **Preconditions:** Single-page PDF, minimal PNG.
- **Actions:** Call `stampSignature(pdf, png, { signerName, signedAt })`.
- **Expected outcome:** Returns valid PDF. Source of truth: existing test S-1 behavior (last page, centered, bottom quarter).
- **Interactions:** `pdf-lib`.

### T-04: Out-of-range pageIndex in placements array throws

- **Name:** A placement with pageIndex=99 on a 1-page PDF throws "Page index 99 out of range"
- **Type:** boundary
- **Disposition:** new
- **Harness:** Direct Vitest — real `stampSignature`
- **Preconditions:** Single-page PDF, minimal PNG, one placement with `pageIndex: 99`.
- **Actions:** Call `stampSignature(pdf, png, { signerName, signedAt, placements })`.
- **Expected outcome:** Rejects with error message containing "Page index 99 out of range". Source of truth: plan Task 2 range check.
- **Interactions:** `pdf-lib`.

### T-05: requestSignature stores placements JSON when provided

- **Name:** Calling requestSignature with a valid placements JSON string stores it in the created record
- **Type:** integration
- **Disposition:** new
- **Harness:** Signature router mock harness
- **Preconditions:** Mock DB with document and employee found. `signatureRecord.create` returns record with placements.
- **Actions:** Call `caller(ctx).signature.requestSignature({ documentId, signerId, placements: JSON.stringify([...]) })`.
- **Expected outcome:** `signatureRecord.create` called with `data.placements` containing the JSON string. Source of truth: plan Task 3 — `requestSignature` stores validated placements.
- **Interactions:** Prisma mock, tRPC input validation.

### T-06: requestSignature works without placements (backward compat)

- **Name:** Calling requestSignature without placements field creates a record with null/undefined placements
- **Type:** regression
- **Disposition:** new
- **Harness:** Signature router mock harness
- **Preconditions:** Mock DB with document and employee found.
- **Actions:** Call `caller(ctx).signature.requestSignature({ documentId, signerId })`.
- **Expected outcome:** `signatureRecord.create` called with `documentId` and `signerId` in data. No crash. Source of truth: existing S-1 test behavior preserved.
- **Interactions:** Prisma mock.

### T-07: requestSignature rejects invalid placements JSON

- **Name:** Passing a non-JSON string as placements throws BAD_REQUEST
- **Type:** boundary
- **Disposition:** new
- **Harness:** Signature router mock harness
- **Preconditions:** Mock DB with document and employee found.
- **Actions:** Call `caller(ctx).signature.requestSignature({ documentId, signerId, placements: 'not-valid-json' })`.
- **Expected outcome:** Rejects with error. Source of truth: plan Task 3 — validation block parses JSON and throws BAD_REQUEST on failure.
- **Interactions:** tRPC input validation, JSON.parse.

### T-08: sign passes placements to stampSignature when record has them

- **Name:** When a signature record has placements JSON, the sign procedure passes parsed placements to stampSignature
- **Type:** integration
- **Disposition:** new
- **Harness:** Signature router mock harness (with stampSignature mocked)
- **Preconditions:** Mock DB returns a PENDING record with `placements: '[{"pageIndex":0,"x":100,"y":200,"width":150,"height":50}]'`. `stampSignature` is mocked.
- **Actions:** Call `caller(ctx).signature.sign({ signatureRecordId, signatureImageBase64 })`.
- **Expected outcome:** `stampSignature` called with options containing `placements: [{ pageIndex: 0, x: 100, y: 200, width: 150, height: 50 }]`. Source of truth: plan Task 3 — sign parses placements and passes to stamper.
- **Interactions:** stampSignature mock, fs.readFile mock, storage mock.

### T-09: sign uses default stamping when record has no placements

- **Name:** When a signature record has null placements, sign does not pass placements to stampSignature
- **Type:** regression
- **Disposition:** new
- **Harness:** Signature router mock harness
- **Preconditions:** Mock DB returns a PENDING record with `placements: null`.
- **Actions:** Call `caller(ctx).signature.sign({ signatureRecordId, signatureImageBase64 })`.
- **Expected outcome:** `stampSignature` called with options that do NOT contain a `placements` key. Source of truth: plan Task 3 — backward compat for legacy records.
- **Interactions:** stampSignature mock.

### T-10: getPdfUrl returns download URL for a document

- **Name:** getPdfUrl returns a URL string for a valid signature record's document
- **Type:** integration
- **Disposition:** new
- **Harness:** Signature router mock harness
- **Preconditions:** Mock DB returns a signature record with `document.filePath` set.
- **Actions:** Call `caller(ctx).signature.getPdfUrl({ signatureRecordId })`.
- **Expected outcome:** Returns `{ url: string }` where url is defined and non-empty. Source of truth: plan Task 3 — getPdfUrl query returns storage download URL.
- **Interactions:** storage.getDownloadUrl mock.

### T-11: PdfViewer renders loading state initially

- **Name:** When PdfViewer mounts, it shows a loading indicator before PDF data loads
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist jsdom mock + Testing Library
- **Preconditions:** pdfjs-dist mocked to return a valid 2-page document.
- **Actions:** `render(<PdfViewer pdfUrl="/test.pdf" />)`.
- **Expected outcome:** Element matching `/loading/i` is in the document. Source of truth: plan Task 4 — loading state returns "Loading PDF..." text.
- **Interactions:** pdfjs-dist mock (getDocument called).

### T-12: PdfViewer renders page navigation after load

- **Name:** After loading a 2-page PDF, page navigation shows "Page 1 of 2"
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist jsdom mock + Testing Library
- **Preconditions:** pdfjs-dist mocked for a 2-page document.
- **Actions:** `render(<PdfViewer pdfUrl="/test.pdf" />)`, then `await screen.findByText(/page 1 of 2/i)`.
- **Expected outcome:** Navigation text is present. Source of truth: plan Task 4 — page navigation renders "Page {n} of {total}".
- **Interactions:** pdfjs-dist getPage, getViewport calls.

### T-13: PdfViewer shows placement overlays when provided

- **Name:** Passing a placement array renders blue dashed overlay boxes at the correct positions
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist jsdom mock + Testing Library
- **Preconditions:** pdfjs-dist mocked, one placement targeting page 0.
- **Actions:** `render(<PdfViewer pdfUrl="/test.pdf" placements={[...]} />)`, await page load, query `getByTestId('placement-0')`.
- **Expected outcome:** `placement-0` element is in the document with "Sign Here" text. Source of truth: plan Task 4 — placement overlays render with "Sign Here" label.
- **Interactions:** React overlay positioning via CSS.

### T-14: PdfViewer calls onPlacementAdd when clicking in edit mode

- **Name:** Clicking on the PDF canvas in edit mode fires onPlacementAdd with page coordinates
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist jsdom mock + Testing Library
- **Preconditions:** pdfjs-dist mocked, PdfViewer rendered with `editable` and `onPlacementAdd` callback.
- **Actions:** Await page load, `fireEvent.click(canvas, { clientX: 100, clientY: 200 })`.
- **Expected outcome:** `onPlacementAdd` called with object containing `{ pageIndex: 0 }`. Source of truth: plan Task 4 — click handler converts canvas coords to PDF points and calls onPlacementAdd.
- **Interactions:** Canvas getBoundingClientRect, coordinate math.

### T-15: PdfViewer calls onPlacementRemove when clicking X on a placement

- **Name:** Clicking the X button on a placement overlay fires onPlacementRemove with the global index
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist jsdom mock + Testing Library
- **Preconditions:** PdfViewer rendered with one placement and `editable` + `onPlacementRemove`.
- **Actions:** Await page load, click `getByTestId('remove-placement-0')`.
- **Expected outcome:** `onPlacementRemove` called with `0`. Source of truth: plan Task 4 — remove button calls onPlacementRemove(globalIdx).
- **Interactions:** Event propagation (stopPropagation on remove click).

### T-16: PdfViewer renders error state for invalid URL

- **Name:** When pdfjs-dist rejects the document load, an error message is shown
- **Type:** boundary
- **Disposition:** new
- **Harness:** pdfjs-dist jsdom mock (overridden to reject) + Testing Library
- **Preconditions:** `getDocument` overridden to return a rejecting promise.
- **Actions:** `render(<PdfViewer pdfUrl="/bad.pdf" />)`, `await screen.findByText(/failed|error/i)`.
- **Expected outcome:** Error text is in the document. Source of truth: plan Task 4 — error state shows "Failed to load PDF: {message}".
- **Interactions:** pdfjs-dist error path.

### T-17: PlacementDialog shows signer picker in step 1

- **Name:** Opening PlacementDialog without a preset signer shows the employee selection dropdown
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library
- **Preconditions:** tRPC mocked for employee.list and document.getDocumentPdfUrl.
- **Actions:** `render(<PlacementDialog open={true} documentId="doc-1" ... />)`.
- **Expected outcome:** Element matching `/select signer/i` is in the document. Source of truth: plan Task 5 — step 1 is signer selection.
- **Interactions:** tRPC employee.list query.

### T-18: PlacementDialog advances to placement step after selecting signer

- **Name:** After selecting an employee and clicking Next, the PDF viewer appears
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library + userEvent
- **Preconditions:** Employee list mocked with two employees.
- **Actions:** Select "emp-1" from dropdown, click "Next: Mark Signature Spots", await `screen.findByText(/page 1/i)`.
- **Expected outcome:** Page navigation text is visible, confirming PDF viewer loaded. Source of truth: plan Task 5 — step 2 shows PDF viewer.
- **Interactions:** tRPC document.getDocumentPdfUrl query, pdfjs-dist load.

### T-19: PlacementDialog shows Send button in placement step

- **Name:** After advancing to the placement step, a Send for Signature button is present
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library
- **Preconditions:** Same as T-18 — advance past signer selection.
- **Actions:** Advance to placement step, query for button matching `/send/i`.
- **Expected outcome:** Send button is in the document. Source of truth: plan Task 5 — Send for Signature button in step 2.
- **Interactions:** None beyond rendering.

### T-20: PlacementDialog can add a placement by clicking on the PDF

- **Name:** Clicking on the PDF canvas in the placement dialog adds a placement overlay
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library
- **Preconditions:** Advance to placement step, PDF canvas rendered.
- **Actions:** `fireEvent.click(getByTestId('pdf-page-0'), { clientX: 100, clientY: 200 })`.
- **Expected outcome:** `getByTestId('placement-0')` is in the document. Source of truth: plan Task 5 — click on PDF adds placement managed by PlacementDialog state.
- **Interactions:** PdfViewer onPlacementAdd callback, PlacementDialog state management.

### T-21: PlacementDialog can remove a placement

- **Name:** After adding a placement, clicking its X button removes it
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library
- **Preconditions:** Advance to placement step, add a placement by clicking canvas.
- **Actions:** Click `getByTestId('remove-placement-0')`, then query `queryByTestId('placement-0')`.
- **Expected outcome:** `placement-0` is NOT in the document. Source of truth: plan Task 5 — PlacementDialog manages placement removal.
- **Interactions:** PdfViewer onPlacementRemove callback.

### T-22: PlacementDialog Send button calls requestSignature with placements JSON

- **Name:** Clicking Send after placing a signature spot calls the mutation with placements string
- **Type:** integration
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library
- **Preconditions:** Advance to placement step, add a placement.
- **Actions:** Click the Send for Signature button.
- **Expected outcome:** `mutateAsync` called with `{ documentId: 'doc-1', signerId: 'emp-1', placements: <JSON string> }`. Source of truth: plan Task 5 — PlacementDialog calls requestSignature.mutateAsync with stringified placements.
- **Interactions:** tRPC mutation mock.

### T-23: PlacementDialog skips signer picker when presetSignerId is provided

- **Name:** When presetSignerId is passed (from People page), the dialog opens directly to the placement step
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC client mock + pdfjs-dist mock + Testing Library
- **Preconditions:** Render with `presetSignerId="emp-2"`.
- **Actions:** `render(<PlacementDialog open={true} presetSignerId="emp-2" ... />)`.
- **Expected outcome:** `/select signer/i` is NOT in the document. Source of truth: plan Task 5 — presetSignerId skips step 1.
- **Interactions:** None.

### T-24: SignatureDialog shows PDF viewer when placements exist

- **Name:** Opening the signing dialog with a record that has placements shows the PDF viewer with placement overlays
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist mock + tRPC mock + Testing Library
- **Preconditions:** SignatureDialog rendered with `signatureRecord.placements` containing a valid JSON array.
- **Actions:** `render(<SignatureDialog open={true} signatureRecord={...} />)`, await `screen.findByText(/page 1/i)`.
- **Expected outcome:** Page navigation and placement overlay (`placement-0`) are visible. Source of truth: plan Task 6 — SignatureDialog renders PdfViewer when placements are present.
- **Interactions:** tRPC signature.getPdfUrl query, pdfjs-dist load.

### T-25: SignatureDialog shows "Sign Here" labels at placement spots

- **Name:** Each placement overlay displays "Sign Here" text to guide the signer
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist mock + tRPC mock + Testing Library
- **Preconditions:** SignatureDialog with one placement.
- **Actions:** Render and await load.
- **Expected outcome:** `screen.getByText('Sign Here')` is in the document. Source of truth: plan Task 4 — placement overlays show label or "Sign Here".
- **Interactions:** PdfViewer overlay rendering.

### T-26: SignatureDialog shows signature pad alongside PDF

- **Name:** The capture step shows both the PDF preview and the signature pad
- **Type:** scenario
- **Disposition:** new
- **Harness:** pdfjs-dist mock + tRPC mock + Testing Library
- **Preconditions:** SignatureDialog with placements, in "capture" step.
- **Actions:** Render and await page load, query for `/draw|type your signature/i`.
- **Expected outcome:** Signature pad instruction text is in the document alongside the PDF viewer. Source of truth: plan Task 6 — SignaturePad rendered below PDF.
- **Interactions:** SignaturePad component rendering.

### T-27: SignatureDialog falls back to legacy dialog when no placements

- **Name:** When signatureRecord has null placements, the simple info-based dialog renders without a PDF viewer
- **Type:** regression
- **Disposition:** new
- **Harness:** tRPC mock + Testing Library
- **Preconditions:** SignatureDialog with `signatureRecord.placements = null`.
- **Actions:** `render(<SignatureDialog open={true} signatureRecord={noPlacementsRecord} />)`.
- **Expected outcome:** Document name is shown, but `pdf-page-0` test ID is NOT in the document. Source of truth: plan Task 6 — legacy records use the existing simple dialog.
- **Interactions:** No pdfjs-dist interaction (not loaded).

### T-28: SignatureDialog has a Sign Document / Continue button

- **Name:** The signing dialog always shows a button to proceed with signing
- **Type:** scenario
- **Disposition:** new
- **Harness:** tRPC mock + Testing Library
- **Preconditions:** SignatureDialog open with placements.
- **Actions:** Render, query for button matching `/sign document|continue/i`.
- **Expected outcome:** Button is in the document. Source of truth: plan Task 6 — Continue button in capture step.
- **Interactions:** None.

---

## Coverage Summary

### Covered

| Area | Tests | What is proven |
|------|-------|---------------|
| Multi-placement stamping | T-01 through T-04 | stampSignature handles multiple placements, explicit coords (backward compat), defaults (backward compat), and out-of-range errors |
| Router: requestSignature with placements | T-05 through T-07 | Placements stored, backward compat without placements, invalid JSON rejected |
| Router: sign with placements | T-08, T-09 | Placements parsed and passed to stamper; null placements use default behavior |
| Router: getPdfUrl | T-10 | New query returns document download URL |
| PdfViewer component | T-11 through T-16 | Loading state, page navigation, placement overlays, click-to-add, click-to-remove, error state |
| PlacementDialog (admin flow) | T-17 through T-23 | Signer picker, step advancement, PDF viewer, add/remove placements, send with placements JSON, preset signer bypass |
| SignatureDialog (signer flow) | T-24 through T-28 | PDF preview with placements, Sign Here labels, signature pad, legacy fallback, sign button |

### Explicitly Excluded (per agreed strategy)

| Excluded area | Risk | Rationale |
|---------------|------|-----------|
| Playwright/browser E2E | Medium | No Playwright installed; agreed in strategy that actual PDF rendering is verified in browser manually |
| Pixel-accuracy CSS positioning | Low | Coordinate math is testable via unit assertions on callback arguments; visual correctness requires real canvas |
| pdfjs worker setup / CDN loading | Low | Infrastructure concern; tested implicitly by the mock harness; real loading tested in dev browser |
| Documents page integration test | Low | Integration with PlacementDialog is a wiring concern; PlacementDialog itself is fully tested; documents page has no existing component tests to extend |
| People page integration test | Low | Same as above; the pen-icon handler change is UI wiring; PlacementDialog handles all logic |
| Performance / load time | Very Low | No performance-sensitive changes; pdfjs-dist loading is async and cached |
