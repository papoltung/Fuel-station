import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    return NextResponse.json({ error: "รองรับเฉพาะ jpg/png/webp" }, { status: 400 });
  }

  const filename = `product-${id}.${ext}`;
  const dir = path.join(process.cwd(), "public", "products");
  await mkdir(dir, { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(path.join(dir, filename), Buffer.from(bytes));

  const imagePath = `/products/${filename}`;
  await prisma.product.update({ where: { id: Number(id) }, data: { image: imagePath } });

  return NextResponse.json({ image: imagePath });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.product.update({ where: { id: Number(id) }, data: { image: null } });
  return NextResponse.json({ ok: true });
}
