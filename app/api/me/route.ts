import { NextResponse } from "next/server";
import { currentAppUser } from "@/lib/authz";

export async function GET() {
  const result = await currentAppUser();
  return result.ok ? NextResponse.json(result.user) : result.response;
}
