import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { prisma } from "@/lib/prisma";
import { isOwnerStockPath } from "@/lib/stock-access";

export async function proxy(request: NextRequest) {
  const oauthCode = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.pathname === "/" && oauthCode) {
    const callbackUrl = new URL("/auth/callback", request.url);
    callbackUrl.searchParams.set("code", oauthCode);
    callbackUrl.searchParams.set("next", "/dashboard");
    return NextResponse.redirect(callbackUrl);
  }

  const config = getSupabaseConfig();
  const loginUrl = new URL("/login", request.url);
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  if (!config) {
    if (isApi) return NextResponse.json({ error: "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน" }, { status: 503 });
    return request.nextUrl.pathname === "/login" ? NextResponse.next() : NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Verify the signed JWT locally when possible; API handlers still perform
  // their own authoritative user check before reading or mutating data.
  const { data: claimData } = await supabase.auth.getClaims();
  const authUserId = typeof claimData?.claims.sub === "string" ? claimData.claims.sub : null;
  const isLogin = request.nextUrl.pathname === "/login";
  if (!authUserId && isApi) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (!authUserId && !isLogin) return NextResponse.redirect(loginUrl);
  if (authUserId && isLogin) return NextResponse.redirect(new URL("/dashboard", request.url));
  if (authUserId && isOwnerStockPath(request.nextUrl.pathname)) {
    try {
      const account = await prisma.appUser.findUnique({ where: { authUserId }, select: { role: true } });
      if (account?.role !== "owner") {
        return isApi
          ? NextResponse.json({ error: "สต็อกเข้าถึงได้เฉพาะ Owner" }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
          : NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      return NextResponse.json({ error: "ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่" }, { status: 503 });
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback).*)"],
};
