import {
  getRandomCuratedGeneratedPuzzleSelection,
  loadCuratedGeneratedPuzzleBySelection,
} from "@/lib/crossword/curated-puzzles";
import { chooseOpeningEntry, createEmptyBoard, splitKnownEntryIds } from "@/lib/game-model";
import type { SharedGameState } from "@/lib/game-types";
import type { ParsedPuzzle } from "@/lib/puz";

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

export async function createSharedGame(puzzleSelection?: string): Promise<SharedGameState> {
  const selection = puzzleSelection || (await getRandomCuratedGeneratedPuzzleSelection());
  const puzzle = await loadCuratedGeneratedPuzzleBySelection(selection);
  return await buildSharedGameState(puzzle, `generated:${selection}`);
}

export async function createSharedGameFromSelection(selection?: string): Promise<SharedGameState> {
  if (!selection || selection === "random") {
    const generatedSelection = await getRandomCuratedGeneratedPuzzleSelection();
    const puzzle = await loadCuratedGeneratedPuzzleBySelection(generatedSelection);
    return await buildSharedGameState(puzzle, `generated:${generatedSelection}`);
  }

  const puzzle = await loadCuratedGeneratedPuzzleBySelection(selection);
  return await buildSharedGameState(puzzle, `generated:${selection}`);
}
