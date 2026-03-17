import { NextRequest, NextResponse } from "next/server";

import { getRandomPuzzleId } from "@/lib/puzzle-library";

export async function GET(request: NextRequest) {
  const currentPuzzleId = request.nextUrl.searchParams.get("current") ?? undefined;
  const nextPuzzleId = await getRandomPuzzleId(currentPuzzleId);
  const redirectUrl = new URL("/local", request.url);

  redirectUrl.searchParams.set("puzzle", nextPuzzleId);

  return NextResponse.redirect(redirectUrl);
}
