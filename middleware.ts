import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/onboarding", "/garage", "/nav", "/drive", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();
  const token = req.cookies.get("driving_session");
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/onboarding", "/garage", "/nav", "/drive", "/admin"],
};
