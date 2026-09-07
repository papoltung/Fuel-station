CREATE TABLE "SaleAudit" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleAudit_saleId_createdAt_idx" ON "SaleAudit"("saleId", "createdAt");
