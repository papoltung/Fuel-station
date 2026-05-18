import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function csvRow(cells: string[]) {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) { const e = new Date(to); e.setHours(23, 59, 59, 999); dateFilter.lte = e; }
    const where = from || to ? { date: dateFilter } : {};

    const [sales, purchases, stockChecks, stocks] = await Promise.all([
      prisma.sale.findMany({ where, include: { fuelType: true }, orderBy: { date: "asc" } }),
      prisma.fuelPurchase.findMany({ include: { fuelType: true }, orderBy: { date: "asc" } }),
      prisma.stockCheck.findMany({ include: { fuelType: true }, orderBy: { date: "asc" } }),
      prisma.fuelStock.findMany({ include: { fuelType: true }, orderBy: { fuelTypeId: "asc" } }),
    ]);

    const PAYMENT: Record<string, string> = { cash: "เงินสด", transfer: "โอน", credit: "เครดิต" };
    const thDate = (d: Date | string) => new Date(d).toLocaleDateString("th-TH");

    const lines: string[] = [];

    // === ยอดขาย ===
    lines.push(csvRow(["=== ยอดขาย ==="]));
    lines.push(csvRow(["วันที่","คนขาย","ชนิดน้ำมัน","หัวจ่าย","ลิตร","ราคา/ลิตร","ยอดเงิน","วิธีจ่าย","ลูกค้าเครดิต","หมายเหตุ"]));
    for (const s of sales) {
      lines.push(csvRow([
        thDate(s.date), s.sellerName, s.fuelType.label, s.pumpNo,
        s.liters.toFixed(2), s.pricePerLiter.toFixed(2), s.totalAmount.toFixed(2),
        PAYMENT[s.paymentMethod] ?? s.paymentMethod, s.customerName ?? "", s.note ?? "",
      ]));
    }
    lines.push("");

    // === รับน้ำมันเข้า ===
    lines.push(csvRow(["=== รับน้ำมันเข้า ==="]));
    lines.push(csvRow(["วันที่","ชนิดน้ำมัน","ลิตร","ราคาทุน/ลิตร","ต้นทุนรวม","เลขที่บิล","ผู้ส่ง","หมายเหตุ"]));
    for (const p of purchases) {
      lines.push(csvRow([
        thDate(p.date), p.fuelType.label, p.liters.toFixed(2),
        p.costPerLiter.toFixed(2), p.totalCost.toFixed(2),
        p.invoiceNo ?? "", p.supplier ?? "", p.note ?? "",
      ]));
    }
    lines.push("");

    // === วัดถัง ===
    lines.push(csvRow(["=== ประวัติวัดถัง ==="]));
    lines.push(csvRow(["วันที่","ชนิดน้ำมัน","คงเหลือตามระบบ (L)","วัดจริง (L)","ส่วนต่าง (L)","หมายเหตุ"]));
    for (const c of stockChecks) {
      lines.push(csvRow([
        thDate(c.date), c.fuelType.label,
        c.systemLiters.toFixed(2), c.actualLiters.toFixed(2), c.difference.toFixed(2),
        c.note ?? "",
      ]));
    }
    lines.push("");

    // === สต๊อกคงเหลือปัจจุบัน ===
    lines.push(csvRow(["=== สต๊อกคงเหลือปัจจุบัน ==="]));
    lines.push(csvRow(["ชนิดน้ำมัน","คงเหลือ (L)","อัพเดตล่าสุด"]));
    for (const s of stocks) {
      lines.push(csvRow([s.fuelType.label, s.currentLiters.toFixed(2), thDate(s.updatedAt)]));
    }

    const bom = "﻿";
    const csv = bom + lines.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fuel-station-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (e) {
    console.error("export error:", e);
    return NextResponse.json({ error: "export ไม่สำเร็จ" }, { status: 500 });
  }
}
