import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fuelTypes = [
    { name: "diesel", label: "ดีเซล" },
    { name: "benzin95", label: "เบนซิน 95" },
    { name: "benzin91", label: "เบนซิน 91" },
    { name: "e20", label: "E20" },
  ];

  for (const ft of fuelTypes) {
    await prisma.fuelType.upsert({
      where: { name: ft.name },
      update: {},
      create: ft,
    });
  }

  console.log("Seeded fuel types.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
