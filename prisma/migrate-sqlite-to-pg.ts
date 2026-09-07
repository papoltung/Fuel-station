import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const sqlite = createClient({ url: "file:./dev.db" });
const prisma = new PrismaClient();

async function main() {
  console.log("Reading from SQLite...");

  const [fuelTypes, sales] = await Promise.all([
    sqlite.execute("SELECT * FROM FuelType"),
    sqlite.execute("SELECT * FROM Sale"),
  ]);

  console.log(`FuelTypes: ${fuelTypes.rows.length}, Sales: ${sales.rows.length}`);

  for (const r of fuelTypes.rows) {
    await prisma.fuelType.upsert({
      where: { id: Number(r.id) },
      update: { currentPrice: Number(r.currentPrice), label: String(r.label) },
      create: {
        id: Number(r.id),
        name: String(r.name),
        label: String(r.label),
        currentPrice: Number(r.currentPrice),
        createdAt: new Date(String(r.createdAt)),
      },
    });
  }
  console.log("✓ FuelType");

  for (const r of sales.rows) {
    await prisma.sale.upsert({
      where: { id: Number(r.id) },
      update: {},
      create: {
        id: Number(r.id),
        clientRequestId: `legacy-${Number(r.id)}`,
        date: new Date(String(r.date)),
        sellerName: String(r.sellerName),
        fuelTypeId: Number(r.fuelTypeId),
        pumpNo: String(r.pumpNo),
        meterStart: r.meterStart != null ? Number(r.meterStart) : null,
        meterEnd: r.meterEnd != null ? Number(r.meterEnd) : null,
        liters: Number(r.liters),
        pricePerLiter: Number(r.pricePerLiter),
        totalAmount: Number(r.totalAmount),
        paymentMethod: String(r.paymentMethod),
        customerName: r.customerName ? String(r.customerName) : null,
        note: r.note ? String(r.note) : null,
        createdAt: new Date(String(r.createdAt)),
      },
    });
  }
  console.log("✓ Sale");

  console.log("\nMigration complete!");
  await prisma.$disconnect();
  sqlite.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
