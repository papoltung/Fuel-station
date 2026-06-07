import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  const types = [
    { name: "diesel", label: "ดีเซล", currentPrice: 0 },
    { name: "benzin95", label: "เบนซิน 95", currentPrice: 0 },
    { name: "benzin91", label: "เบนซิน 91", currentPrice: 0 },
    { name: "e20", label: "E20", currentPrice: 0 },
  ];

  for (const t of types) {
    await prisma.fuelType.upsert({
      where: { name: t.name },
      update: {},
      create: t,
    });
  }
  console.log("✓ Seeded FuelTypes");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
