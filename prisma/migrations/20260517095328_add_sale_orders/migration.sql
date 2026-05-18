-- CreateTable
CREATE TABLE "SaleOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "pumpNo" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "pricePerLiter" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "customerName" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "SaleOrder_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
