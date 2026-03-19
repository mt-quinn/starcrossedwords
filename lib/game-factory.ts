import { readFile } from "node:fs/promises";

import {
  getRandomCuratedGeneratedPuzzleSelection,
  loadCuratedGeneratedPuzzleBySelection,
} from "@/lib/crossword/curated-puzzles";
import { chooseOpeningEntry, createEmptyBoard, splitKnownEntryIds } from "@/lib/game-model";
import type { SharedGameState } from "@/lib/game-types";
import type { ParsedPuzzle } from "@/lib/puz";
import { getPuzzlePathFromId, getRandomPuzzleId } from "@/lib/puzzle-library";
import { parsePuz } from "@/lib/puz";

async function buildSharedGameState(puzzle: ParsedPuzzle, puzzleId: string): Promise<SharedGameState> {
  const knownEntryIdsByPlayer = splitKnownEntryIds(puzzle);
  const createdAt = new Date().toISOString();

  return {
    puzzleId,
    puzzle,
    board: createEmptyBoard(puzzle),
    currentEntryIdByPlayer: {
      player1: chooseOpeningEntry(knownEntryIdsByPlayer.player1, puzzle.entries),
      player2: chooseOpeningEntry(knownEntryIdsByPlayer.player2, puzzle.entries),
    },
    knownEntryIdsByPlayer,
    clueDraftsByPlayer: {
      player1: {},
      player2: {},
    },
    clueHistory: {},
    answerHistory: {},
    recentTurns: [],
    turnNumber: 0,
    currentTurnPlayerId: "player1",
    phase: "opening_clue",
    pendingAnswerEntryId: null,
    pendingReview: null,
    createdAt,
    updatedAt: createdAt,
    revision: 0,
  };
}

export async function createSharedGame(puzzleId?: string): Promise<SharedGameState> {
  const resolvedPuzzleId = puzzleId || (await getRandomPuzzleId());
  const buffer = await readFile(getPuzzlePathFromId(resolvedPuzzleId));
  const puzzle = parsePuz(buffer);
  return await buildSharedGameState(puzzle, resolvedPuzzleId);
}

export async function createSharedGameFromSelection(selection?: string): Promise<SharedGameState> {
  if (!selection || selection === "random") {
    const generatedSelection = await getRandomCuratedGeneratedPuzzleSelection();
    const puzzle = await loadCuratedGeneratedPuzzleBySelection(generatedSelection);
    return await buildSharedGameState(puzzle, `generated:${generatedSelection}`);
  }

  if (selection === "legacy") {
    return await createSharedGame();
  }

  const puzzle = await loadCuratedGeneratedPuzzleBySelection(selection);
  return await buildSharedGameState(puzzle, `generated:${selection}`);
}
