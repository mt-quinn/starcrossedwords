import { readFile } from "node:fs/promises";

import { chooseOpeningEntry, createEmptyBoard, splitKnownEntryIds } from "@/lib/game-model";
import type { SharedGameState } from "@/lib/game-types";
import { getPuzzlePathFromId, getRandomPuzzleId } from "@/lib/puzzle-library";
import { parsePuz } from "@/lib/puz";

export async function createSharedGame(puzzleId?: string): Promise<SharedGameState> {
  const resolvedPuzzleId = puzzleId || (await getRandomPuzzleId());
  const buffer = await readFile(getPuzzlePathFromId(resolvedPuzzleId));
  const puzzle = parsePuz(buffer);
  const knownEntryIdsByPlayer = splitKnownEntryIds(puzzle);
  const createdAt = new Date().toISOString();

  return {
    puzzleId: resolvedPuzzleId,
    puzzle,
    board: createEmptyBoard(puzzle),
    currentEntryIdByPlayer: {
      player1: chooseOpeningEntry(knownEntryIdsByPlayer.player1, puzzle.entries),
      player2: chooseOpeningEntry(knownEntryIdsByPlayer.player2, puzzle.entries),
    },
    knownEntryIdsByPlayer,
    clueHistory: {},
    recentTurns: [],
    turnNumber: 0,
    currentTurnPlayerId: "player1",
    createdAt,
    updatedAt: createdAt,
    revision: 0,
  };
}
