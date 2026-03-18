import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  SITE_LOCK_COOKIE_NAME,
  getSiteLockToken,
  isSiteLockEnabled,
  normalizeNextPath,
} from "@/lib/site-lock";

const UNLOCK_PAGE_PATH = "/unlock";
const UNLOCK_API_PATH = "/api/unlock";

function isAllowedPublicPath(pathname: string): boolean {
  return pathname === UNLOCK_PAGE_PATH || pathname === UNLOCK_API_PATH;
}

export async function middleware(request: NextRequest) {
  if (!isSiteLockEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (isAllowedPublicPath(pathname)) {
    const expectedToken = await getSiteLockToken();
    const currentToken = request.cookies.get(SITE_LOCK_COOKIE_NAME)?.value;

    if (pathname === UNLOCK_PAGE_PATH && expectedToken && currentToken === expectedToken) {
      const nextPath = normalizeNextPath(request.nextUrl.searchParams.get("next") ?? "/");
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    return NextResponse.next();
  }

  const expectedToken = await getSiteLockToken();
  const currentToken = request.cookies.get(SITE_LOCK_COOKIE_NAME)?.value;

  if (expectedToken && currentToken === expectedToken) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Password required." }, { status: 401 });
  }

  const unlockUrl = new URL(UNLOCK_PAGE_PATH, request.url);
  unlockUrl.searchParams.set("next", normalizeNextPath(`${pathname}${search}`));
  return NextResponse.redirect(unlockUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
