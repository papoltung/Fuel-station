ALTER TABLE "ProductSale" ADD COLUMN "costPriceAtSale" DOUBLE PRECISION;

CREATE TABLE "FuelPurchaseAudit" (
  "id" SERIAL NOT NULL,
  "fuelPurchaseId" INTEGER NOT NULL,
  "actorId" INTEGER NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "oldCost" DOUBLE PRECISION NOT NULL,
  "newCost" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelPurchaseAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FuelPurchaseAudit_fuelPurchaseId_createdAt_idx" ON "FuelPurchaseAudit"("fuelPurchaseId", "createdAt");
ALTER TABLE "FuelPurchaseAudit" ADD CONSTRAINT "FuelPurchaseAudit_fuelPurchaseId_fkey" FOREIGN KEY ("fuelPurchaseId") REFERENCES "FuelPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
