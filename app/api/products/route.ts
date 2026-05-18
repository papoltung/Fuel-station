import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  const products = await prisma.product.findMany({
    where: all ? undefined : { isActive: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, unit, size, category, currentPrice, costPrice, currentStock, minStock } = body;
  if (!name || !unit) return NextResponse.json({ error: "name/unit required" }, { status: 400 });
  const product = await prisma.product.create({
    data: {
      name, unit,
      size: size ?? "",
      category: category ?? "",
      currentPrice: currentPrice ?? 0,
      costPrice: costPrice ?? 0,
      currentStock: currentStock ?? 0,
      minStock: minStock ?? 3,
    },
  });
  return NextResponse.json(product, { status: 201 });
}
