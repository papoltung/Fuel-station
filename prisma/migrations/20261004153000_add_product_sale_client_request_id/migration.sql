-- AlterTable
ALTER TABLE "ProductSale" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProductSale_clientRequestId_key" ON "ProductSale"("clientRequestId");
