CREATE TABLE "Shift" (
  "id" SERIAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "openingCash" DOUBLE PRECISION NOT NULL,
  "cashSales" DOUBLE PRECISION,
  "expectedCash" DOUBLE PRECISION,
  "actualCash" DOUBLE PRECISION,
  "difference" DOUBLE PRECISION,
  "openedById" INTEGER NOT NULL,
  "openedByName" TEXT NOT NULL,
  "openedByEmail" TEXT NOT NULL,
  "closedById" INTEGER,
  "closedByName" TEXT,
  "closedByEmail" TEXT,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Sale" ADD COLUMN "shiftId" INTEGER;
ALTER TABLE "ProductSale" ADD COLUMN "shiftId" INTEGER;

CREATE INDEX "Shift_openedById_status_idx" ON "Shift"("openedById", "status");
CREATE INDEX "Shift_openedAt_idx" ON "Shift"("openedAt");
CREATE UNIQUE INDEX "Shift_one_open_per_user_idx" ON "Shift"("openedById") WHERE "status" = 'open';
CREATE INDEX "Sale_shiftId_idx" ON "Sale"("shiftId");
CREATE INDEX "ProductSale_shiftId_idx" ON "ProductSale"("shiftId");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
