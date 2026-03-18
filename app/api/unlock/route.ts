import { NextResponse } from "next/server";

import {
  SITE_LOCK_COOKIE_NAME,
  getSiteLockToken,
  getSitePassword,
  normalizeNextPath,
} from "@/lib/site-lock";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = normalizeNextPath(String(formData.get("next") ?? "/"));
  const configuredPassword = getSitePassword();

  if (!configuredPassword) {
    return NextResponse.redirect(new URL(nextPath, request.url), { status: 303 });
  }

  if (password !== configuredPassword) {
    const failedUrl = new URL("/unlock", request.url);
    failedUrl.searchParams.set("error", "1");
    failedUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(failedUrl, { status: 303 });
  }

  const token = await getSiteLockToken();
  const response = NextResponse.redirect(new URL(nextPath, request.url), { status: 303 });

  if (token) {
    response.cookies.set({
      name: SITE_LOCK_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
