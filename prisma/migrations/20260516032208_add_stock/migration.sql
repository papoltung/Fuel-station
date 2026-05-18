-- CreateTable
CREATE TABLE "FuelPurchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "liters" REAL NOT NULL,
    "costPerLiter" REAL NOT NULL,
    "totalCost" REAL NOT NULL,
    "invoiceNo" TEXT,
    "supplier" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FuelPurchase_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "systemLiters" REAL NOT NULL,
    "actualLiters" REAL NOT NULL,
    "difference" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCheck_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FuelStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fuelTypeId" INTEGER NOT NULL,
    "currentLiters" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FuelStock_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelStock_fuelTypeId_key" ON "FuelStock"("fuelTypeId");
