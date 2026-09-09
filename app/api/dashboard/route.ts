import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { GET as getSalesSummary } from "@/app/api/sales/summary/route";

export async function GET(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const date = req.nextUrl.searchParams.get("date")
    ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(`${date}T23:59:59.999+07:00`);
  const where = { date: { gte: start, lte: end } };
  const meterOwnerWhere = auth.user.role === "owner" ? {} : {
    OR: [
      { openedById: auth.user.id },
      { shift: { openedById: auth.user.id } },
    ],
  };
  const summaryRequest = new NextRequest(new URL(`/api/sales/summary?date=${date}`, req.url));

  const [summaryResponse, stocks, sales, meters, productSales] = await Promise.all([
    getSalesSummary(summaryRequest),
    auth.user.role === "owner"
      ? prisma.fuelStock.findMany({ include: { fuelType: true }, orderBy: { fuelTypeId: "asc" } })
      : Promise.resolve([]),
    prisma.sale.findMany({ where, include: { fuelType: true, pump: true }, orderBy: { createdAt: "desc" } }),
    prisma.meterPeriod.findMany({
      where: { ...where, ...meterOwnerWhere },
      include: { fuelType: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.productSale.findMany({ where, include: { product: true }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!summaryResponse.ok) return NextResponse.json({ error: "โหลดข้อมูลสรุปไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({
    account: auth.user,
    summary: await summaryResponse.json(),
    stocks,
    sales,
    meters,
    productSales,
  });
}
