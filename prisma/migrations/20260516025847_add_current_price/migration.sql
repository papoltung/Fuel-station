-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FuelType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currentPrice" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_FuelType" ("createdAt", "id", "label", "name") SELECT "createdAt", "id", "label", "name" FROM "FuelType";
DROP TABLE "FuelType";
ALTER TABLE "new_FuelType" RENAME TO "FuelType";
CREATE UNIQUE INDEX "FuelType_name_key" ON "FuelType"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
