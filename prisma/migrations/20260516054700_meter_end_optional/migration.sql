-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MeterPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "meterStart" REAL NOT NULL,
    "meterEnd" REAL,
    "liters" REAL,
    "pricePerLiter" REAL NOT NULL,
    "totalRevenue" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeterPeriod_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MeterPeriod" ("createdAt", "date", "fuelTypeId", "id", "liters", "meterEnd", "meterStart", "note", "pricePerLiter", "totalRevenue") SELECT "createdAt", "date", "fuelTypeId", "id", "liters", "meterEnd", "meterStart", "note", "pricePerLiter", "totalRevenue" FROM "MeterPeriod";
DROP TABLE "MeterPeriod";
ALTER TABLE "new_MeterPeriod" RENAME TO "MeterPeriod";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
