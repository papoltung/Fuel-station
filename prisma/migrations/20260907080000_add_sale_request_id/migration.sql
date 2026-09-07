ALTER TABLE "Sale" ADD COLUMN "clientRequestId" TEXT;
UPDATE "Sale" SET "clientRequestId" = 'legacy-' || "id"::text;
ALTER TABLE "Sale" ALTER COLUMN "clientRequestId" SET NOT NULL;
CREATE UNIQUE INDEX "Sale_clientRequestId_key" ON "Sale"("clientRequestId");
