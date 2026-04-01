import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/_next", "/favicon.ico", "/api", "/opswatch-api"];
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-opswatch-path", `${pathname}${search}`);

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const sessionCookie = request.cookies.get("opswatch_session");
  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}` || "/overview");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
