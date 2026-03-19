import { readFile } from "node:fs/promises";

import type { GridTemplate } from "@/lib/crossword/types";
import { getPuzzlePathFromId, listStandardPuzzleIds } from "@/lib/puzzle-library";
import { parsePuz } from "@/lib/puz";

export async function listSourceTemplatePuzzleIds(): Promise<string[]> {
  return await listStandardPuzzleIds();
}

export async function buildTemplateFromPuzzleId(
  puzzleId: string,
  templateId: string,
  title: string,
): Promise<GridTemplate> {
  const buffer = await readFile(getPuzzlePathFromId(puzzleId));
  const puzzle = parsePuz(buffer);

  if (puzzle.width !== 15 || puzzle.height !== 15) {
    throw new Error(`Expected a 15x15 puzzle, got ${puzzle.width}x${puzzle.height}.`);
  }

  return {
    id: templateId,
    title,
    width: puzzle.width,
    height: puzzle.height,
    rows: Array.from({ length: puzzle.height }, (_, rowIndex) =>
      Array.from({ length: puzzle.width }, (_, colIndex) => {
        const cell = puzzle.cells[rowIndex * puzzle.width + colIndex];
        return cell.isBlock ? "#" : ".";
      }).join(""),
    ),
  };
}
