import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getSalesSummaryData } from "@/lib/sales-summary-service";

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

  const [summary, stocks, sales, meters, productSales] = await Promise.all([
    getSalesSummaryData(date),
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

  return NextResponse.json({
    account: auth.user,
    summary,
    stocks,
    sales,
    meters,
    productSales,
  });
}
