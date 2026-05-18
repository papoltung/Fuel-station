-- CreateTable
CREATE TABLE "MeterPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "meterStart" REAL NOT NULL,
    "meterEnd" REAL NOT NULL,
    "liters" REAL NOT NULL,
    "pricePerLiter" REAL NOT NULL,
    "totalRevenue" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeterPeriod_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
