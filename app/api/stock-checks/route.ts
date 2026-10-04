import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import {
  parseStockCheckInput,
  STOCK_CHECK_ERROR_CODES,
} from "@/lib/stock-check";

export async function GET() {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  try {
    const checks = await prisma.stockCheck.findMany({
      include: { fuelType: true },
      orderBy: { date: "desc" },
      take: 30,
    });
    return NextResponse.json(checks);
  } catch (e) {
    console.error("stock-checks GET error:", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const input = parseStockCheckInput(body);

    if (input.expectedVersion === null) {
      return NextResponse.json(
        {
          error: "ข้อมูลเวอร์ชันสต็อกไม่ถูกต้อง กรุณารีเฟรชหน้าจอเพื่อรับข้อมูลล่าสุด",
          code: STOCK_CHECK_ERROR_CODES.VERSION_REQUIRED,
        },
        { status: 409 }
      );
    }

    const check = await prisma.$transaction(async (tx) => {
      const stock = await tx.fuelStock.findUnique({
        where: { fuelTypeId: input.fuelTypeId },
      });

      if (!stock) {
        throw new Error(STOCK_CHECK_ERROR_CODES.FUEL_STOCK_NOT_INITIALIZED);
      }

      if (stock.version !== input.expectedVersion) {
        throw new Error(STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK);
      }

      const systemLiters = stock.currentLiters;
      const difference = input.actualLiters - systemLiters;

      const c = await tx.stockCheck.create({
        data: {
          date: input.date,
          fuelTypeId: input.fuelTypeId,
          systemLiters,
          actualLiters: input.actualLiters,
          difference,
          note: input.note,
        },
        include: { fuelType: true },
      });

      const updateResult = await tx.fuelStock.updateMany({
        where: {
          fuelTypeId: input.fuelTypeId,
          version: input.expectedVersion,
        },
        data: {
          currentLiters: input.actualLiters,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK);
      }

      return c;
    });

    return NextResponse.json(check, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK) {
        return NextResponse.json(
          {
            error: "สต็อกน้ำมันมีการเปลี่ยนแปลงระหว่างการวัดถัง กรุณาโหลดข้อมูลล่าสุดและยืนยันอีกครั้ง",
            code: STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK,
          },
          { status: 409 }
        );
      }
      if (e.message === STOCK_CHECK_ERROR_CODES.FUEL_STOCK_NOT_INITIALIZED) {
        return NextResponse.json(
          {
            error: "ยังไม่ได้เริ่มต้นสต็อกสำหรับชนิดน้ำมันนี้ กรุณาตั้งค่าสต็อกก่อนทำการวัดถัง",
            code: STOCK_CHECK_ERROR_CODES.FUEL_STOCK_NOT_INITIALIZED,
          },
          { status: 409 }
        );
      }
      if (
        e.message === "รหัสชนิดน้ำมันไม่ถูกต้อง" ||
        e.message === "จำนวนลิตรที่วัดได้จริงไม่ถูกต้อง" ||
        e.message === "จำนวนลิตรในระบบที่อ้างอิงไม่ถูกต้อง" ||
        e.message === "เวอร์ชันสต็อกไม่ถูกต้อง" ||
        e.message === "วันที่ไม่ถูกต้อง"
      ) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }
    console.error("stock-checks POST error:", e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการบันทึกการวัดถัง" }, { status: 500 });
  }
}
