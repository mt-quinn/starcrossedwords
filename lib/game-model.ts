import type { ParsedPuzzle, PuzzleEntry } from "@/lib/puz";
import type {
  ClueEvent,
  GameView,
  PlayerId,
  SharedClueEvent,
  SharedGameState,
  SharedTurnSummary,
  TurnSummary,
} from "@/lib/game-types";

const PLAYER_ONE: PlayerId = "player1";
const PLAYER_TWO: PlayerId = "player2";

export function playerLabel(playerId: PlayerId): string {
  return playerId === PLAYER_ONE ? "Player 1" : "Player 2";
}

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

export function slotLabelFromEntry(entry: PuzzleEntry): string {
  return `${entry.number}${entry.direction === "across" ? "A" : "D"}`;
}

export function splitKnownEntryIds(
  puzzle: ParsedPuzzle,
): Record<PlayerId, string[]> {
  const acrossEntries = puzzle.entries.filter((entry) => entry.direction === "across");
  const downEntries = puzzle.entries.filter((entry) => entry.direction === "down");

  return {
    player1: [
      ...acrossEntries.filter((_, index) => index % 2 === 0).map((entry) => entry.id),
      ...downEntries.filter((_, index) => index % 2 === 1).map((entry) => entry.id),
    ],
    player2: [
      ...acrossEntries.filter((_, index) => index % 2 === 1).map((entry) => entry.id),
      ...downEntries.filter((_, index) => index % 2 === 0).map((entry) => entry.id),
    ],
  };
}

export function chooseOpeningEntry(
  knownEntryIds: string[],
  entries: PuzzleEntry[],
): string {
  const preferredAcross = entries.find(
    (entry) => knownEntryIds.includes(entry.id) && entry.direction === "across",
  );

  if (preferredAcross) {
    return preferredAcross.id;
  }

  return knownEntryIds[0] ?? entries[0].id;
}

export function createEmptyBoard(puzzle: ParsedPuzzle): string[] {
  return Array.from({ length: puzzle.cells.length }, () => "");
}

export function canPlayerClueEntry(
  state: SharedGameState,
  playerId: PlayerId,
  entryId: string,
): boolean {
  return state.knownEntryIdsByPlayer[playerId].includes(entryId);
}

export function canPlayerFillEntry(
  state: SharedGameState,
  playerId: PlayerId,
  entryId: string,
): boolean {
  if (state.knownEntryIdsByPlayer[playerId].includes(entryId)) {
    return false;
  }

  const history = state.clueHistory[entryId] ?? [];
  return history.some((event) => event.author === otherPlayer(playerId));
}

function getAllowedCellIndices(
  state: SharedGameState,
  playerId: PlayerId,
): Set<number> {
  const fillableEntries = state.puzzle.entries.filter((entry) =>
    canPlayerFillEntry(state, playerId, entry.id),
  );

  return new Set(fillableEntries.flatMap((entry) => entry.cellIndices));
}

function normalizeBoard(nextBoard: string[], expectedLength: number): string[] {
  if (nextBoard.length !== expectedLength) {
    throw new Error("Board payload length mismatch.");
  }

  return nextBoard.map((value) => {
    const trimmed = value.trim().toUpperCase();

    if (!trimmed) {
      return "";
    }

    if (!/^[A-Z]$/.test(trimmed)) {
      throw new Error("Board payload contained invalid cell values.");
    }

    return trimmed;
  });
}

function sanitizePuzzleForViewer(
  puzzle: ParsedPuzzle,
  knownEntryIds: Set<string>,
): ParsedPuzzle {
  return {
    ...puzzle,
    cells: puzzle.cells.map((cell) => ({
      ...cell,
      solution: "",
    })),
    entries: puzzle.entries.map((entry) => ({
      ...entry,
      answer: knownEntryIds.has(entry.id) ? entry.answer : "",
    })),
  };
}

function mapClueHistoryForViewer(
  clueHistory: Record<string, SharedClueEvent[]>,
  viewer: PlayerId,
): Record<string, ClueEvent[]> {
  return Object.fromEntries(
    Object.entries(clueHistory).map(([entryId, history]) => [
      entryId,
      history.map((event) => ({
        ...event,
        author: event.author === viewer ? "you" : "partner",
      })),
    ]),
  );
}

function mapRecentTurnsForViewer(
  turns: SharedTurnSummary[],
  viewer: PlayerId,
): TurnSummary[] {
  return turns.map((turn) => ({
    ...turn,
    actor: turn.actor === viewer ? "you" : "partner",
  }));
}

function withMetadata(state: SharedGameState): SharedGameState {
  return {
    ...state,
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function buildGameViewForPlayer(
  state: SharedGameState,
  viewer: PlayerId,
): GameView {
  const knownEntryIds = state.knownEntryIdsByPlayer[viewer];
  const knownEntryIdSet = new Set(knownEntryIds);

  return {
    puzzleId: state.puzzleId,
    puzzle: sanitizePuzzleForViewer(state.puzzle, knownEntryIdSet),
    board: state.board,
    currentEntryId: state.currentEntryIdByPlayer[viewer],
    knownEntryIds,
    clueHistory: mapClueHistoryForViewer(state.clueHistory, viewer),
    recentTurns: mapRecentTurnsForViewer(state.recentTurns, viewer),
    partnerName: playerLabel(otherPlayer(viewer)),
    playerName: playerLabel(viewer),
    turnNumber: state.turnNumber,
    matchLabel: state.roomCode ?? state.puzzleId.replace(/\.puz$/i, ""),
  };
}

export function applyBoardChange(
  state: SharedGameState,
  playerId: PlayerId,
  nextBoardInput: string[],
): SharedGameState {
  if (state.currentTurnPlayerId !== playerId) {
    throw new Error("It is not that player's turn.");
  }

  const nextBoard = normalizeBoard(nextBoardInput, state.board.length);
  const allowedIndices = getAllowedCellIndices(state, playerId);

  for (let index = 0; index < state.board.length; index += 1) {
    if (state.board[index] !== nextBoard[index] && !allowedIndices.has(index)) {
      throw new Error("That player cannot edit the changed cells.");
    }
  }

  return withMetadata({
    ...state,
    board: nextBoard,
  });
}

export function applyClueSubmission(
  state: SharedGameState,
  playerId: PlayerId,
  entryId: string,
  clueText: string,
): SharedGameState {
  if (state.currentTurnPlayerId !== playerId) {
    throw new Error("It is not that player's turn.");
  }

  if (!canPlayerClueEntry(state, playerId, entryId)) {
    throw new Error("That player cannot clue this entry.");
  }

  const trimmedClue = clueText.trim();

  if (!trimmedClue) {
    throw new Error("Clue text cannot be empty.");
  }

  const nextPlayerId = otherPlayer(playerId);
  const nextTurn = state.turnNumber + 1;
  const timestamp = new Date().toISOString();
  const entry = state.puzzle.entries.find((candidate) => candidate.id === entryId);

  if (!entry) {
    throw new Error("Could not find the requested entry.");
  }

  return withMetadata({
    ...state,
    clueHistory: {
      ...state.clueHistory,
      [entryId]: [
        ...(state.clueHistory[entryId] ?? []),
        {
          entryId,
          author: playerId,
          clue: trimmedClue,
          turn: nextTurn,
          timestamp,
        },
      ],
    },
    recentTurns: [
      {
        turn: nextTurn,
        actor: playerId,
        entryId,
        label: slotLabelFromEntry(entry),
        clue: trimmedClue,
      },
      ...state.recentTurns,
    ].slice(0, 12),
    turnNumber: nextTurn,
    currentTurnPlayerId: nextPlayerId,
    currentEntryIdByPlayer: {
      ...state.currentEntryIdByPlayer,
      [playerId]: entryId,
      [nextPlayerId]: entryId,
    },
  });
}
