-- CreateTable
CREATE TABLE "FuelType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerName" TEXT NOT NULL,
    "fuelTypeId" INTEGER NOT NULL,
    "pumpNo" TEXT NOT NULL,
    "meterStart" DOUBLE PRECISION,
    "meterEnd" DOUBLE PRECISION,
    "liters" DOUBLE PRECISION NOT NULL,
    "pricePerLiter" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "customerName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelPurchase" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "costPerLiter" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "invoiceNo" TEXT,
    "supplier" TEXT,
    "note" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "paidNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCheck" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "systemLiters" DOUBLE PRECISION NOT NULL,
    "actualLiters" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelStock" (
    "id" SERIAL NOT NULL,
    "fuelTypeId" INTEGER NOT NULL,
    "currentLiters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'ขวด',
    "size" TEXT NOT NULL DEFAULT '',
    "currentPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 3,
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSale" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerName" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "customerName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counts" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleOrder" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "pumpNo" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "pricePerLiter" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "customerName" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "SaleOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDebt" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDebtPayment" (
    "id" SERIAL NOT NULL,
    "debtId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterPeriod" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelTypeId" INTEGER NOT NULL,
    "meterStart" DOUBLE PRECISION NOT NULL,
    "meterEnd" DOUBLE PRECISION,
    "liters" DOUBLE PRECISION,
    "pricePerLiter" DOUBLE PRECISION NOT NULL,
    "totalRevenue" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelType_name_key" ON "FuelType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FuelStock_fuelTypeId_key" ON "FuelStock"("fuelTypeId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPurchase" ADD CONSTRAINT "FuelPurchase_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCheck" ADD CONSTRAINT "StockCheck_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelStock" ADD CONSTRAINT "FuelStock_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDebtPayment" ADD CONSTRAINT "SupplierDebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "SupplierDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterPeriod" ADD CONSTRAINT "MeterPeriod_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
