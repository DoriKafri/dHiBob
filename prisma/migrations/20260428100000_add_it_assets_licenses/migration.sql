-- IT Asset Management
CREATE TABLE "ITAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "serialNumber" TEXT,
    "model" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Laptop',
    "assigneeId" TEXT,
    "factoryOS" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "warrantyStatus" TEXT,
    "warrantyEndDate" TIMESTAMP(3),
    "cpu" TEXT,
    "ram" TEXT,
    "storage" TEXT,
    "gpu" TEXT,
    "notes" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ITAsset_pkey" PRIMARY KEY ("id")
);

-- IT License Management
CREATE TABLE "ITLicense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "publisher" TEXT,
    "planName" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "licenseType" TEXT NOT NULL DEFAULT 'Monthly',
    "renewalDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Active',
    "totalSeats" INTEGER NOT NULL DEFAULT 0,
    "pricePerSeat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ITLicense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ITLicenseAssignment" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ITLicenseAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ITAsset_companyId_idx" ON "ITAsset"("companyId");
CREATE INDEX "ITAsset_assigneeId_idx" ON "ITAsset"("assigneeId");
CREATE INDEX "ITAsset_status_idx" ON "ITAsset"("status");
CREATE INDEX "ITAsset_type_idx" ON "ITAsset"("type");
CREATE INDEX "ITLicense_companyId_idx" ON "ITLicense"("companyId");
CREATE INDEX "ITLicense_status_idx" ON "ITLicense"("status");
CREATE INDEX "ITLicenseAssignment_licenseId_idx" ON "ITLicenseAssignment"("licenseId");
CREATE INDEX "ITLicenseAssignment_employeeId_idx" ON "ITLicenseAssignment"("employeeId");
CREATE UNIQUE INDEX "ITLicenseAssignment_licenseId_employeeId_key" ON "ITLicenseAssignment"("licenseId", "employeeId");

ALTER TABLE "ITAsset" ADD CONSTRAINT "ITAsset_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ITLicenseAssignment" ADD CONSTRAINT "ITLicenseAssignment_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "ITLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ITLicenseAssignment" ADD CONSTRAINT "ITLicenseAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
