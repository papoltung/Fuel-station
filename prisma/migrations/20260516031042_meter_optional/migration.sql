-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerName" TEXT NOT NULL,
    "fuelTypeId" INTEGER NOT NULL,
    "pumpNo" TEXT NOT NULL,
    "meterStart" REAL,
    "meterEnd" REAL,
    "liters" REAL NOT NULL,
    "pricePerLiter" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "customerName" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "customerName", "date", "fuelTypeId", "id", "liters", "meterEnd", "meterStart", "note", "paymentMethod", "pricePerLiter", "pumpNo", "sellerName", "totalAmount") SELECT "createdAt", "customerName", "date", "fuelTypeId", "id", "liters", "meterEnd", "meterStart", "note", "paymentMethod", "pricePerLiter", "pumpNo", "sellerName", "totalAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
