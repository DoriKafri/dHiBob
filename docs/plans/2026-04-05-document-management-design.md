# Document Management Module Design

## Overview
A comprehensive Document Management system for the HiBob clone, featuring secure employee personal folders, company-wide shared policies, and a mock e-signature workflow.

## Architecture & UI Components
- **Dashboard (`/documents`)**: HR view for company documents with category-based navigation.
- **Personal Folders**: A "Documents" tab within the Employee Profile (`/people/[id]`) for personal contracts and ID copies.
- **Components**:
  - `DocumentTable`: List view with file metadata and download actions.
  - `UploadModal`: Drag-and-drop interface for uploading files with category selection.
  - `SignatureStatus`: Visual badges for "Signed", "Pending", or "View Only" states.

## Data Flow
1. **Metadata Management**: tRPC `documentRouter` handles Prisma records for file names, sizes, and signature statuses.
2. **File Storage Abstraction**: A `StorageProvider` interface separates logic from implementation.
   - **Local MVP**: Saves files to a persistent `/uploads` server directory.
   - **Future S3**: Ready to swap for AWS S3 by implementing the same interface.
3. **Upload Route**: A Next.js API route (`/api/documents/upload`) handles binary data transfer, linking successful uploads to Prisma records.

## Security & Robustness
- **Access Control**: Strict multi-tenant scoping and role-based access (Employee can only see their own docs; HR sees all).
- **Secure Transfers**: Files are served through a server-side proxy/stream to prevent unauthorized public access.
- **Validation**: Whitelisting file types (PDF, DOCX, etc.) and enforcing size limits via Zod.

## Testing Strategy
- **Service Tests**: Unit tests for the `StorageProvider` filesystem logic.
- **Integration Tests**: tRPC scoping verification to ensure data isolation.
- **Workflow Tests**: Functional tests for the e-signature mock flow.
