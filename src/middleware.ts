import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home/:path*",
    "/people/:path*",
    "/time-off/:path*",
    "/hiring/:path*",
    "/performance/:path*",
    "/analytics/:path*",
    "/payroll/:path*",
    "/onboarding/:path*",
    "/learning/:path*",
    "/surveys/:path*",
    "/documents/:path*",
    "/settings/:path*",
    "/reports/:path*",
    "/offboarding/:path*",
    "/hr-portal/:path*",
    "/expenses/:path*",
  ],
};
