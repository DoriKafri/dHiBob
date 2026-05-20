-- Add storage-key columns alongside the legacy base64 columns.
-- invoiceFileKey / fileKey hold an S3 (or local-storage) key. The old
-- invoiceFile / fileData columns stay around during the backfill; a
-- follow-up migration will drop them once every row has been migrated.

ALTER TABLE "ExpenseClaim" ADD COLUMN "invoiceFileKey" TEXT;
ALTER TABLE "HrPortalItem" ADD COLUMN "fileKey" TEXT;
