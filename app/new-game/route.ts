import { NextResponse } from "next/server";

import { getRandomCuratedGeneratedPuzzleSelection } from "@/lib/crossword/curated-puzzles";

export async function GET(request: Request) {
  const selection = await getRandomCuratedGeneratedPuzzleSelection();
  const redirectUrl = new URL("/local", request.url);

  redirectUrl.searchParams.set("puzzle", selection);

  return NextResponse.redirect(redirectUrl);
}
