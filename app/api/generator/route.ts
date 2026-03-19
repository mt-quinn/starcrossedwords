import { NextResponse } from "next/server";

import { saveGeneratedPuzzle } from "@/lib/crossword/generated-puzzles";
import { generateCrossword } from "@/lib/crossword/solver";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    templateId?: string;
  };

  try {
    const generatedPuzzle = await generateCrossword({
      templateId: body.templateId,
    });
    const fileName = await saveGeneratedPuzzle(generatedPuzzle);

    return NextResponse.json({
      ok: true,
      fileName,
      generatedAt: generatedPuzzle.generatedAt,
      templateId: generatedPuzzle.templateId,
      solver: generatedPuzzle.solver,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Crossword generation failed.",
      },
      { status: 500 },
    );
  }
}
