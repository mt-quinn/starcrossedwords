import { NextResponse } from "next/server";

import { buildCuratedGeneratedPuzzleSet } from "@/lib/crossword/curated-set-builder";

export const runtime = "nodejs";

export async function POST() {
  try {
    const index = await buildCuratedGeneratedPuzzleSet();
    return NextResponse.json({
      ok: true,
      generatedAt: index.generatedAt,
      puzzles: index.puzzles,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Curated puzzle generation failed.",
      },
      { status: 500 },
    );
  }
}
