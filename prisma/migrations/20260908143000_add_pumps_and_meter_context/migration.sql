-- Add stable pump identities while keeping existing sales and meter rows valid.
CREATE TABLE "Pump" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pump_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pump_number_key" ON "Pump"("number");

ALTER TABLE "Pump" ADD COLUMN "fuelTypeId" INTEGER;

ALTER TABLE "Sale" ADD COLUMN "pumpId" INTEGER;
ALTER TABLE "MeterPeriod" ADD COLUMN "shiftId" INTEGER;
ALTER TABLE "MeterPeriod" ADD COLUMN "pumpId" INTEGER;
ALTER TABLE "MeterPeriod" ADD COLUMN "openedById" INTEGER;
ALTER TABLE "MeterPeriod" ADD COLUMN "openedByName" TEXT;
ALTER TABLE "MeterPeriod" ADD COLUMN "openedByEmail" TEXT;
ALTER TABLE "MeterPeriod" ADD COLUMN "closedById" INTEGER;
ALTER TABLE "MeterPeriod" ADD COLUMN "closedByName" TEXT;
ALTER TABLE "MeterPeriod" ADD COLUMN "closedByEmail" TEXT;
ALTER TABLE "MeterPeriod" ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE INDEX "Sale_shiftId_pumpId_idx" ON "Sale"("shiftId", "pumpId");
CREATE INDEX "MeterPeriod_shiftId_pumpId_idx" ON "MeterPeriod"("shiftId", "pumpId");
CREATE INDEX "MeterPeriod_pumpId_meterEnd_idx" ON "MeterPeriod"("pumpId", "meterEnd");
CREATE UNIQUE INDEX "MeterPeriod_one_open_per_pump_idx"
  ON "MeterPeriod"("pumpId")
  WHERE "pumpId" IS NOT NULL AND "meterEnd" IS NULL;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_pumpId_fkey"
  FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeterPeriod" ADD CONSTRAINT "MeterPeriod_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeterPeriod" ADD CONSTRAINT "MeterPeriod_pumpId_fkey"
  FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The existing quick-sale UI exposes four heads. Seed stable identities so the
-- new validation does not make an existing installation unable to sell.
INSERT INTO "Pump" ("number", "label", "fuelTypeId", "updatedAt")
SELECT '1', 'หัวจ่าย 1', id, CURRENT_TIMESTAMP FROM "FuelType" WHERE name = 'diesel'
ON CONFLICT ("number") DO NOTHING;
INSERT INTO "Pump" ("number", "label", "fuelTypeId", "updatedAt")
SELECT '2', 'หัวจ่าย 2', id, CURRENT_TIMESTAMP FROM "FuelType" WHERE name = 'benzin95'
ON CONFLICT ("number") DO NOTHING;
INSERT INTO "Pump" ("number", "label", "fuelTypeId", "updatedAt")
SELECT '3', 'หัวจ่าย 3', id, CURRENT_TIMESTAMP FROM "FuelType" WHERE name = 'benzin91'
ON CONFLICT ("number") DO NOTHING;
INSERT INTO "Pump" ("number", "label", "fuelTypeId", "updatedAt")
SELECT '4', 'หัวจ่าย 4', id, CURRENT_TIMESTAMP FROM "FuelType" WHERE name = 'e20'
ON CONFLICT ("number") DO NOTHING;

-- If an installation has not seeded FuelType rows yet, keep the stable heads
-- available but unconfigured. The API rejects them until an Owner configures
-- fuelTypeId; this is safer than guessing a fuel mapping.
INSERT INTO "Pump" ("number", "label", "updatedAt") VALUES
  ('1', 'หัวจ่าย 1', CURRENT_TIMESTAMP),
  ('2', 'หัวจ่าย 2', CURRENT_TIMESTAMP),
  ('3', 'หัวจ่าย 3', CURRENT_TIMESTAMP),
  ('4', 'หัวจ่าย 4', CURRENT_TIMESTAMP)
ON CONFLICT ("number") DO NOTHING;

ALTER TABLE "Pump" ADD CONSTRAINT "Pump_fuelTypeId_fkey"
  FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
