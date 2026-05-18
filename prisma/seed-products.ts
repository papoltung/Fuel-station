import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  { category: "เฟืองท้าย", name: "Trane Super HD Gear Oil SAE90", size: "5L", unit: "ขวด", currentStock: 4, currentPrice: 0, costPrice: 0, minStock: 2 },
  { category: "เฟืองท้าย", name: "Trane Super HD Gear Oil SAE140 5L", size: "5L", unit: "ขวด", currentStock: 4, currentPrice: 0, costPrice: 0, minStock: 2 },
  { category: "เฟืองท้าย", name: "Trane Super HD Gear Oil SAE140 1L", size: "1L", unit: "ขวด", currentStock: 2, currentPrice: 0, costPrice: 0, minStock: 1 },
  { category: "น้ำมันเกษตร", name: "น้ำมันเครื่องเกษตร (ขวดฟ้า)", size: "3L", unit: "ขวด", currentStock: 4, currentPrice: 0, costPrice: 0, minStock: 2 },
  { category: "น้ำมันอเนกประสงค์", name: "Orakon", size: "4L", unit: "ขวด", currentStock: 4, currentPrice: 190, costPrice: 0, minStock: 2 },
  { category: "2T", name: "Shell Advance VSX", size: "0.5L", unit: "ขวด", currentStock: 12, currentPrice: 110, costPrice: 88, minStock: 4 },
  { category: "2T", name: "Havoline Plus 2T", size: "", unit: "ขวด", currentStock: 7, currentPrice: 65, costPrice: 0, minStock: 3 },
  { category: "2T", name: "Daikyo Low Smoke 2T", size: "0.5L", unit: "ขวด", currentStock: 10, currentPrice: 70, costPrice: 52, minStock: 4 },
  { category: "2T", name: "RAC Oil Super Turbo", size: "", unit: "ขวด", currentStock: 2, currentPrice: 70, costPrice: 0, minStock: 2 },
  { category: "4T", name: "Pro Honda 4T JASO MA30", size: "1L", unit: "ขวด", currentStock: 3, currentPrice: 80, costPrice: 0, minStock: 2 },
  { category: "น้ำมันเครื่อง", name: "Honda Protech Gold 4AT", size: "1L", unit: "ขวด", currentStock: 3, currentPrice: 100, costPrice: 0, minStock: 2 },
  { category: "น้ำมันเครื่อง", name: "Havoline 20W-40", size: "1L", unit: "ขวด", currentStock: 2, currentPrice: 0, costPrice: 0, minStock: 1 },
  { category: "น้ำมันดีเซล", name: "Caltex Super Diesel Oil 15W-40", size: "1L", unit: "ขวด", currentStock: 1, currentPrice: 120, costPrice: 0, minStock: 2 },
  { category: "น้ำยาหม้อน้ำ", name: "Titan Coolant สีชมพู", size: "", unit: "ขวด", currentStock: 15, currentPrice: 0, costPrice: 0, minStock: 5 },
  { category: "น้ำกลั่น", name: "น้ำกลั่นแบตเตอรี่", size: "", unit: "ขวด", currentStock: 2, currentPrice: 0, costPrice: 0, minStock: 2 },
  { category: "สเปรย์", name: "Wurth Diesel / สเปรย์อเนกประสงค์", size: "", unit: "กระป๋อง", currentStock: 3, currentPrice: 100, costPrice: 0, minStock: 2 },
];

async function main() {
  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.product.create({ data: p });
      console.log(`+ ${p.name}`);
    } else {
      console.log(`skip: ${p.name}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
