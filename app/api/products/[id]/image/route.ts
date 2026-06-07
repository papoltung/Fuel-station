import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://doglpjixsyuhtabaxmib.supabase.co",
  "sb_publishable_68Dxw2zNu2ruFvXzmPhV1Q_2EoIJIfp"
);

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
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from("products")
    .upload(filename, Buffer.from(bytes), {
      contentType: file.type,
      upsert: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("products").getPublicUrl(filename);

  await prisma.product.update({ where: { id: Number(id) }, data: { image: publicUrl } });

  return NextResponse.json({ image: publicUrl });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.product.update({ where: { id: Number(id) }, data: { image: null } });
  return NextResponse.json({ ok: true });
}
