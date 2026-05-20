CREATE TABLE "ITAssetNote" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ITAssetNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ITAssetNote_assetId_idx" ON "ITAssetNote"("assetId");
CREATE INDEX "ITAssetNote_authorId_idx" ON "ITAssetNote"("authorId");

ALTER TABLE "ITAssetNote" ADD CONSTRAINT "ITAssetNote_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ITAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ITAssetNote" ADD CONSTRAINT "ITAssetNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
