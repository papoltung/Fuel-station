import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { saleSnapshot } from "@/lib/sale-audit";
import {
  parseSaleEditInput,
  parseSaleCancelInput,
  SALE_MUTATION_ERROR_CODES,
} from "@/lib/sale-mutation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "เลขรายการไม่ถูกต้อง" }, { status: 400 });
  const sale = await prisma.sale.findUnique({ where: { id }, include: { fuelType: true } });
  return sale ? NextResponse.json(sale) : NextResponse.json({ error: "ไม่พบรายการขาย" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "เลขรายการไม่ถูกต้อง" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  let input;
  try {
    input = parseSaleEditInput({ ...body, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ข้อมูลแก้ไขไม่ถูกต้อง" }, { status: 400 });
  }

  if (input.expectedVersion === null) {
    return NextResponse.json(
      {
        error: "ข้อมูลเวอร์ชันรายการขายไม่ถูกต้อง กรุณารีเฟรชหน้าจอเพื่อรับข้อมูลล่าสุด",
        code: SALE_MUTATION_ERROR_CODES.VERSION_REQUIRED,
      },
      { status: 409 }
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Read existing Sale
      const existing = await tx.sale.findUnique({ where: { id: input.id } });
      if (!existing) throw new Error(SALE_MUTATION_ERROR_CODES.SALE_NOT_FOUND);
      if (existing.version !== input.expectedVersion) throw new Error(SALE_MUTATION_ERROR_CODES.SALE_CHANGED);

      // 2. Conditionally claim and update Sale
      const updateResult = await tx.sale.updateMany({
        where: { id: input.id, version: input.expectedVersion },
        data: {
          fuelTypeId: input.fuelTypeId,
          totalAmount: input.totalAmount,
          pricePerLiter: input.pricePerLiter,
          liters: input.liters,
          paymentMethod: input.paymentMethod,
          pumpNo: input.pumpNo,
          customerName: input.customerName,
          note: input.note,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(SALE_MUTATION_ERROR_CODES.SALE_CHANGED);
      }

      // 3. Stock adjustments with sufficiency guards
      if (existing.fuelTypeId === input.fuelTypeId) {
        const delta = existing.liters - input.liters;
        if (delta > 0) {
          // Restoring fuel to tank (old > new)
          await tx.fuelStock.update({
            where: { fuelTypeId: input.fuelTypeId },
            data: {
              currentLiters: { increment: delta },
              version: { increment: 1 },
            },
          });
        } else if (delta < 0) {
          // Consuming more fuel from tank (old < new)
          const additionalRequired = -delta;
          const stockUpdate = await tx.fuelStock.updateMany({
            where: {
              fuelTypeId: input.fuelTypeId,
              currentLiters: { gte: additionalRequired },
            },
            data: {
              currentLiters: { decrement: additionalRequired },
              version: { increment: 1 },
            },
          });
          if (stockUpdate.count !== 1) {
            throw new Error(SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK);
          }
        }
        // If delta === 0 (e.g. payment-only edit): FuelStock is not touched!
      } else {
        // Different fuel: deterministic order by fuelTypeId to avoid lock inversion
        const [firstFuelId, secondFuelId] = [existing.fuelTypeId, input.fuelTypeId].sort((a, b) => a - b);

        const applyFuelChange = async (ftId: number) => {
          if (ftId === existing.fuelTypeId) {
            // Restore old tank
            await tx.fuelStock.update({
              where: { fuelTypeId: existing.fuelTypeId },
              data: {
                currentLiters: { increment: existing.liters },
                version: { increment: 1 },
              },
            });
          } else {
            // Conditionally decrement new tank
            const stockUpdate = await tx.fuelStock.updateMany({
              where: {
                fuelTypeId: input.fuelTypeId,
                currentLiters: { gte: input.liters },
              },
              data: {
                currentLiters: { decrement: input.liters },
                version: { increment: 1 },
              },
            });
            if (stockUpdate.count !== 1) {
              throw new Error(SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK);
            }
          }
        };

        await applyFuelChange(firstFuelId);
        await applyFuelChange(secondFuelId);
      }

      // 4. Read freshly updated sale
      const freshSale = await tx.sale.findUnique({
        where: { id: input.id },
        include: { fuelType: true },
      });

      // 5. Create SaleAudit
      await tx.saleAudit.create({
        data: {
          saleId: input.id,
          action: "update",
          actorId: auth.user.id,
          actorName: auth.user.name,
          actorEmail: auth.user.email,
          beforeData: saleSnapshot(existing),
          afterData: freshSale ? saleSnapshot(freshSale) : undefined,
          reason: input.reason,
        },
      });

      return freshSale;
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === SALE_MUTATION_ERROR_CODES.SALE_NOT_FOUND) {
        return NextResponse.json({ error: "ไม่พบรายการขาย" }, { status: 404 });
      }
      if (error.message === SALE_MUTATION_ERROR_CODES.SALE_CHANGED) {
        return NextResponse.json(
          {
            error: "รายการขายนี้มีการเปลี่ยนแปลงจากผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุด",
            code: SALE_MUTATION_ERROR_CODES.SALE_CHANGED,
          },
          { status: 409 }
        );
      }
      if (error.message === SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK) {
        return NextResponse.json(
          {
            error: "สต็อกน้ำมันไม่เพียงพอสำหรับการแก้ไขรายการขาย",
            code: SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK,
          },
          { status: 409 }
        );
      }
    }
    console.error("PATCH /api/sales/[id] error:", error);
    return NextResponse.json({ error: "แก้ไขรายการไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "เลขรายการไม่ถูกต้อง" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  let input;
  try {
    input = parseSaleCancelInput({ ...body, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ข้อมูลยกเลิกไม่ถูกต้อง" }, { status: 400 });
  }

  if (input.expectedVersion === null) {
    return NextResponse.json(
      {
        error: "ข้อมูลเวอร์ชันรายการขายไม่ถูกต้อง กรุณารีเฟรชหน้าจอเพื่อรับข้อมูลล่าสุด",
        code: SALE_MUTATION_ERROR_CODES.VERSION_REQUIRED,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Read existing Sale
      const existing = await tx.sale.findUnique({ where: { id: input.id } });
      if (!existing) throw new Error(SALE_MUTATION_ERROR_CODES.SALE_NOT_FOUND);
      if (existing.version !== input.expectedVersion) throw new Error(SALE_MUTATION_ERROR_CODES.SALE_CANCELLED);

      // 2. Conditionally claim and delete Sale
      const deleteResult = await tx.sale.deleteMany({
        where: { id: input.id, version: input.expectedVersion },
      });
      if (deleteResult.count !== 1) {
        throw new Error(SALE_MUTATION_ERROR_CODES.SALE_CANCELLED);
      }

      // 3. Create SaleAudit cancel record
      await tx.saleAudit.create({
        data: {
          saleId: input.id,
          action: "cancel",
          actorId: auth.user.id,
          actorName: auth.user.name,
          actorEmail: auth.user.email,
          beforeData: saleSnapshot(existing),
          reason: input.reason,
        },
      });

      // 4. Restore FuelStock using exact Sale state
      await tx.fuelStock.update({
        where: { fuelTypeId: existing.fuelTypeId },
        data: {
          currentLiters: { increment: existing.liters },
          version: { increment: 1 },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === SALE_MUTATION_ERROR_CODES.SALE_NOT_FOUND) {
        return NextResponse.json({ error: "ไม่พบรายการขาย" }, { status: 404 });
      }
      if (error.message === SALE_MUTATION_ERROR_CODES.SALE_CANCELLED) {
        return NextResponse.json(
          {
            error: "รายการขายนี้ถูกเปลี่ยนแปลงหรือยกเลิกไปแล้ว",
            code: SALE_MUTATION_ERROR_CODES.SALE_CANCELLED,
          },
          { status: 409 }
        );
      }
    }
    console.error("DELETE /api/sales/[id] error:", error);
    return NextResponse.json({ error: "ยกเลิกรายการไม่สำเร็จ" }, { status: 500 });
  }
}
