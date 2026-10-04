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
    openedById: auth.user.id,
  };
  const summaryRequest = new NextRequest(new URL(`/api/sales/summary?date=${date}`, req.url));

  const [summaryResponse, stocks, sales, meters, productSales] = await Promise.all([
    getSalesSummary(summaryRequest),
    auth.user.role === "owner"
      ? prisma.fuelStock.findMany({
          select: {
            fuelTypeId: true,
            currentLiters: true,
            fuelType: { select: { id: true, name: true, label: true } },
          },
          orderBy: { fuelTypeId: "asc" },
        })
      : Promise.resolve([]),
    prisma.sale.findMany({
      where,
      select: {
        id: true,
        date: true,
        sellerName: true,
        totalAmount: true,
        paymentMethod: true,
        pumpNo: true,
        fuelType: { select: { id: true, name: true, label: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 8,
    }),
    prisma.meterPeriod.findMany({
      where: { ...where, ...meterOwnerWhere, meterEnd: null },
      select: {
        id: true,
        meterEnd: true,
        fuelType: { select: { id: true, name: true, label: true } },
      },
      orderBy: { date: "desc" },
      take: 20,
    }),
    prisma.productSale.findMany({
      where,
      select: {
        id: true,
        date: true,
        sellerName: true,
        totalAmount: true,
        paymentMethod: true,
        quantity: true,
        product: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 8,
    }),
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
