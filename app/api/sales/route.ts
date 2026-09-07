import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSameSaleRequest, parseSaleInput } from "@/lib/sale-input";
import { requireRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");

  let where = {};
  if (dateStr) {
    const start = new Date(dateStr + "T00:00:00+07:00");
    const end = new Date(dateStr + "T23:59:59.999+07:00");
    where = { date: { gte: start, lte: end } };
  }

  const sales = await prisma.sale.findMany({
    where,
    include: { fuelType: true },
    orderBy: { createdAt: "desc" },
    take: dateStr ? undefined : 200,
  });

  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;
  let input: ReturnType<typeof parseSaleInput>;
  try {
    input = parseSaleInput({ ...await req.json(), sellerName: auth.user.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          clientRequestId: input.clientRequestId,
          date: input.date ? new Date(input.date) : new Date(),
          sellerName: input.sellerName,
          fuelTypeId: input.fuelTypeId,
          pumpNo: input.pumpNo,
          meterStart: input.meterStart,
          meterEnd: input.meterEnd,
          liters: input.liters,
          pricePerLiter: input.pricePerLiter,
          totalAmount: input.totalAmount,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          note: input.note,
        },
        include: { fuelType: true },
      });
      await tx.fuelStock.upsert({
        where: { fuelTypeId: input.fuelTypeId },
        create: { fuelTypeId: input.fuelTypeId, currentLiters: -input.liters },
        update: { currentLiters: { decrement: input.liters } },
      });
      return created;
    });
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.sale.findUnique({
        where: { clientRequestId: input.clientRequestId },
        include: { fuelType: true },
      });
      const sameRequest = existing && isSameSaleRequest(existing, input);
      if (sameRequest) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
    console.error("sales POST error:", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
