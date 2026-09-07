ALTER TABLE "Sale" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "Sale_clientRequestId_key" ON "Sale"("clientRequestId");
