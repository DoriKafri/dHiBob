# Replace DocuSign with Self-Owned E-Signature System

## Overview

Remove the DocuSign third-party integration entirely and replace it with a self-owned, in-app document e-signature system. Signers will be able to draw their signature on an HTML canvas (pen/touch) or type their name rendered in a signature-style font. The captured signature image is stamped onto the target PDF using `pdf-lib`, and a signed copy is saved to storage. Signature status is tracked end-to-end in the database (who signed, when, status transitions).

This eliminates the dependency on DocuSign API keys, external webhooks, and third-party costs while providing a complete signing experience within DHiBob.

## Current State (What Exists Today)

### DocuSign integration surface area

| File | Role |
|---|---|
| `src/lib/docusign.ts` | Library: `isDocuSignConfigured()`, `sendForSignature()` (placeholder, never calls real API) |
| `src/app/api/docusign/send/route.ts` | Next.js API route to send a document for signature via DocuSign |
| `src/app/api/docusign/callback/route.ts` | Webhook endpoint for DocuSign Connect status updates |
| `src/server/routers/employee.ts` | tRPC procedures: `isDocuSignConfigured`, `sendForSignature` (lines 491-550) |
| `src/app/(dashboard)/documents/page.tsx` | "Send for Signature" dialog referencing DocuSign status |
| `src/app/(dashboard)/people/[id]/page.tsx` | `SendForSignatureInline` component calling `/api/docusign/send` |
| `.env.example` | Five `DOCUSIGN_*` env vars (lines 18-22) |

### Prisma schema

The `Document` model already has a `signatureStatus String?` field (line 456 in schema.prisma). The `document.ts` router has a `sign` mutation that sets `signatureStatus` to `'SIGNED'`.

### Storage

Files are stored via a `StorageProvider` abstraction (`src/lib/storage.ts`) supporting both local disk and S3. Upload/download/delete routes exist under `src/app/api/files/`.

## What Will Be Built

### 1. Signature Capture Component

A new React component `SignaturePad` with two input modes:

**Draw mode** -- An HTML5 `<canvas>` element where the user draws their signature with mouse, pen, or touch input. Features:
- Pressure-sensitive stroke rendering (thicker on press, thinner on lift)
- Clear / Undo buttons
- Responsive canvas that works on mobile and desktop
- Export to PNG data URL (`canvas.toDataURL('image/png')`)

**Type mode** -- A text input where the user types their name, rendered in a signature-style cursive font. Options:
- 3-4 font choices (e.g., Dancing Script, Great Vibes, Pacifico, Homemade Apple -- all Google Fonts, free to use)
- Live preview of the typed name in each font so the user can pick their preferred style
- The selected rendering is captured to a PNG via an offscreen canvas

Both modes output a single `signatureImageBase64: string` (PNG) that the backend consumes.

### 2. PDF Signature Stamping (Server-Side)

**New dependency: `pdf-lib`** (MIT license, zero native deps, runs in Node.js)

A new server-side utility `src/lib/signature-stamper.ts`:

```
stampSignature(pdfBytes: Uint8Array, signatureImagePng: Uint8Array, options: {
  pageIndex?: number;      // default: last page
  x?: number;              // default: centered
  y?: number;              // default: bottom quarter
  width?: number;          // default: 200
  signerName: string;
  signedAt: Date;
}) => Promise<Uint8Array>  // returns new PDF bytes with signature embedded
```

Process:
1. Load the PDF with `PDFDocument.load(pdfBytes)`
2. Embed the signature PNG with `pdfDoc.embedPng(signatureImagePng)`
3. Draw the image on the specified page at the specified coordinates
4. Add a text annotation below the image: "{signerName} -- Signed {date}" in a small font
5. Save and return `pdfDoc.save()`

The signed PDF is saved as a new file in storage (e.g., `contracts/original-name.signed.pdf`) so the original is preserved.

### 3. New Prisma Models

#### SignatureRecord

Tracks every signature event with an audit trail.

```prisma
model SignatureRecord {
  id              String   @id @default(cuid())
  documentId      String
  signerId        String
  signerName      String
  signerEmail     String
  status          String   @default("PENDING")  // PENDING | SIGNED | DECLINED
  signatureImage  String?                       // storage key for the PNG
  signedPdfPath   String?                       // storage key for the stamped PDF
  requestedAt     DateTime @default(now())
  signedAt        DateTime?
  declinedAt      DateTime?
  declineReason   String?
  requestedBy     String                        // employee ID of the person who sent the request
  companyId       String

  document  Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  signer    Employee @relation("SignatureRecordSigner", fields: [signerId], references: [id], onDelete: Cascade)
  requester Employee @relation("SignatureRecordRequester", fields: [requestedBy], references: [id], onDelete: Cascade)
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([signerId])
  @@index([companyId])
  @@index([status])
}
```

#### Document model update

Add a relation to `SignatureRecord`:

```prisma
  signatures  SignatureRecord[]
```

The existing `signatureStatus` field is kept for backward compatibility and serves as the aggregate status of the document (derived from its `SignatureRecord` entries).

### 4. New tRPC Router: `signatureRouter`

A dedicated router in `src/server/routers/signature.ts` with these procedures:

| Procedure | Type | Description |
|---|---|---|
| `requestSignature` | mutation | HR sends a document to an employee for signing. Creates a `SignatureRecord` with status `PENDING`. Updates `Document.signatureStatus` to `PENDING_SIGNATURE`. Sends notification to the signer. |
| `sign` | mutation | Signer submits their signature image (base64 PNG). Backend: (1) fetches the original PDF from storage, (2) calls `stampSignature()` to create the signed copy, (3) saves the signed PDF and the signature image to storage, (4) updates the `SignatureRecord` to `SIGNED` with `signedAt`, (5) updates `Document.signatureStatus` to `SIGNED`, (6) sends notification to the requester. |
| `decline` | mutation | Signer declines to sign. Updates `SignatureRecord` to `DECLINED` with reason. Updates `Document.signatureStatus` to `DECLINED`. Notifies requester. |
| `getPending` | query | Returns all `SignatureRecord` entries with status `PENDING` for the current user (signer). Powers the "documents awaiting your signature" view. |
| `getByDocument` | query | Returns all `SignatureRecord` entries for a given document ID. Shows signature history/audit trail. |
| `getSignedPdf` | query | Returns a download URL for the signed PDF copy. |

### 5. UI Changes

#### New: Signature Dialog (`src/components/documents/signature-dialog.tsx`)

A modal dialog containing the `SignaturePad` component. Opened when an employee clicks "Sign" on a document pending their signature. Includes:
- Document name and requester info at the top
- Tab toggle: "Draw" / "Type"
- The signature pad itself
- "Sign Document" and "Decline" action buttons
- Confirmation step before final submission

#### Updated: Documents Page (`/documents`)

- Remove the DocuSign status check (`trpc.employee.isDocuSignConfigured.useQuery()`)
- Remove the DocuSign warning banner
- Replace "Send for Signature" dialog: instead of asking for signer email/name (DocuSign flow), show a dropdown of employees in the company (the signer is always an internal employee)
- Add a "Pending My Signature" section at the top of the page showing documents the current user needs to sign, each with a "Sign Now" button that opens the Signature Dialog
- Add a "View Signed Copy" button on documents with status `SIGNED`, linking to the stamped PDF

#### Updated: Employee Profile Page (`/people/[id]`)

- Remove the `SendForSignatureInline` component and its `/api/docusign/send` fetch call
- Replace with a "Request Signature" button that calls `signatureRouter.requestSignature` via tRPC
- Show signature status badges on documents (reuse existing `SIG_BADGE` map)

### 6. Files to Delete (DocuSign Removal)

| File | Action |
|---|---|
| `src/lib/docusign.ts` | Delete |
| `src/app/api/docusign/send/route.ts` | Delete |
| `src/app/api/docusign/callback/route.ts` | Delete |
| `src/app/api/docusign/` (directory) | Delete |

### 7. Files to Modify

| File | Changes |
|---|---|
| `src/server/routers/employee.ts` | Remove `isDocuSignConfigured` and `sendForSignature` procedures (lines 491-550). Remove `import { isDocuSignConfigured, sendForSignature } from '@/lib/docusign'` (line 5). |
| `src/server/routers/_app.ts` | Add `signature: signatureRouter` to the merged router |
| `src/app/(dashboard)/documents/page.tsx` | Remove DocuSign references, add pending-signatures section, add sign/decline actions |
| `src/app/(dashboard)/people/[id]/page.tsx` | Remove `SendForSignatureInline` component, replace with tRPC-based signature request |
| `prisma/schema.prisma` | Add `SignatureRecord` model, add `signatures` relation on `Document` |
| `.env.example` | Remove the five `DOCUSIGN_*` env vars |
| `package.json` | Add `pdf-lib` dependency |

### 8. Notifications Integration

Reuse the existing `notifyService.send()` infrastructure with these event types:

| Event | Trigger | Recipients |
|---|---|---|
| `DOCUMENT_PENDING_SIGNATURE` | Already exists. Sent when `requestSignature` is called. | The signer |
| `DOCUMENT_SIGNED` | Already exists. Sent when `sign` is called. | The requester |
| `DOCUMENT_DECLINED` | New. Sent when `decline` is called. | The requester |

## Implementation Order

### Task 1: Add `pdf-lib` dependency and create signature stamper utility
- `npm install pdf-lib`
- Create `src/lib/signature-stamper.ts` with the `stampSignature` function
- Unit test: load a minimal PDF, stamp a 1x1 PNG, verify output is valid PDF with more bytes than input

### Task 2: Add `SignatureRecord` Prisma model
- Update `prisma/schema.prisma` with the new model and relations
- Run `prisma db push` to apply
- Add relation fields on `Document`, `Employee`, and `Company` models

### Task 3: Create `signatureRouter` with all procedures
- Create `src/server/routers/signature.ts`
- Wire into `_app.ts`
- Implement: `requestSignature`, `sign`, `decline`, `getPending`, `getByDocument`, `getSignedPdf`
- Integration tests against real SQLite test DB

### Task 4: Build `SignaturePad` component
- Create `src/components/documents/signature-pad.tsx` (canvas draw + type modes)
- Create `src/components/documents/signature-dialog.tsx` (modal wrapper)
- Component tests: renders both modes, switching tabs works, clear button resets canvas, type mode renders preview

### Task 5: Update Documents page
- Remove DocuSign references from `documents/page.tsx`
- Add "Pending My Signature" section with sign/decline actions
- Update "Send for Signature" to use employee picker instead of email input
- Add "View Signed Copy" download button

### Task 6: Update Employee Profile page
- Remove `SendForSignatureInline` component from `people/[id]/page.tsx`
- Remove `/api/docusign/send` fetch calls
- Add tRPC-based "Request Signature" flow using `signatureRouter.requestSignature`

### Task 7: Delete DocuSign files and clean up
- Delete `src/lib/docusign.ts`
- Delete `src/app/api/docusign/` directory (both route files)
- Remove `DOCUSIGN_*` vars from `.env.example`
- Remove DocuSign imports and procedures from `employee.ts` router
- Full build (`npm run build`) to verify no broken imports
- Run all tests (`npm run test`) to verify no regressions

## Non-Goals (Out of Scope)

- **Multi-signer workflows** -- this iteration supports one signer per document. Multi-signer (sequential or parallel) can be added later by allowing multiple `SignatureRecord` entries per document.
- **Signature placement UI** -- the signer does not drag-and-drop where the signature goes on the PDF. The stamp is placed at a sensible default position (bottom of last page). A drag-to-place feature is a future enhancement.
- **Legal compliance (eIDAS, ESIGN Act)** -- this is a self-hosted HR tool, not a legally binding e-signature platform. The audit trail (`SignatureRecord`) provides evidence of intent, but no qualified electronic signature or third-party timestamping is included.
- **External signers** -- only employees within the same company can be signers. External parties (candidates, vendors) are not supported in this iteration.
- **PDF viewer in-app** -- the signer downloads or opens the PDF in a new tab to review it. An embedded PDF viewer is a future enhancement.

## Dependencies

| Dependency | Version | License | Why |
|---|---|---|---|
| `pdf-lib` | ^1.17.1 | MIT | Stamp signature images onto PDF documents server-side. Zero native dependencies, pure JS, works in Node.js. |

No other new dependencies are needed. The signature canvas uses the native HTML5 Canvas API. Signature fonts are loaded from Google Fonts via CSS.
