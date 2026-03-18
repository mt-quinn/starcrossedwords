import type { ParsedPuzzle } from "@/lib/puz";

export type PlayerId = "player1" | "player2";
export type TurnPhase = "opening_clue" | "answer" | "review" | "clue";

export interface ClueEvent {
  entryId: string;
  author: "you" | "partner";
  clue: string;
  turn: number;
  timestamp: string;
}

export interface AnswerEvent {
  entryId: string;
  author: "you" | "partner";
  fill: string;
  turn: number;
  timestamp: string;
}

export interface ReviewPrompt {
  entryId: string;
  submittedFill: string;
  clue: string;
  turn: number;
  timestamp: string;
}

export interface ClueDraft {
  clue: string;
  updatedAt: number;
}

export interface GameView {
  puzzleId: string;
  puzzle: ParsedPuzzle;
  board: string[];
  currentEntryId: string;
  knownEntryIds: string[];
  clueDrafts: Record<string, ClueDraft>;
  clueHistory: Record<string, ClueEvent[]>;
  answerHistory: Record<string, AnswerEvent[]>;
  recentTurns: TurnSummary[];
  partnerName: string;
  playerName: string;
  turnNumber: number;
  matchLabel: string;
  phase: TurnPhase;
  incomingEntryId: string | null;
  reviewPrompt: ReviewPrompt | null;
}

export interface TurnSummary {
  turn: number;
  actor: "you" | "partner";
  entryId: string;
  label: string;
  clue: string;
}

export interface SharedClueEvent {
  entryId: string;
  author: PlayerId;
  clue: string;
  turn: number;
  timestamp: string;
}

export interface SharedAnswerEvent {
  entryId: string;
  author: PlayerId;
  fill: string;
  turn: number;
  timestamp: string;
}

export interface SharedReviewPrompt {
  playerId: PlayerId;
  entryId: string;
  answerTurn: number;
}

export interface SharedClueDraft {
  clue: string;
  updatedAt: number;
}

export interface SharedTurnSummary {
  turn: number;
  actor: PlayerId;
  entryId: string;
  label: string;
  clue: string;
}

export interface SharedGameState {
  puzzleId: string;
  puzzle: ParsedPuzzle;
  board: string[];
  currentEntryIdByPlayer: Record<PlayerId, string>;
  knownEntryIdsByPlayer: Record<PlayerId, string[]>;
  clueDraftsByPlayer: Record<PlayerId, Record<string, SharedClueDraft>>;
  clueHistory: Record<string, SharedClueEvent[]>;
  answerHistory: Record<string, SharedAnswerEvent[]>;
  recentTurns: SharedTurnSummary[];
  turnNumber: number;
  currentTurnPlayerId: PlayerId;
  phase: TurnPhase;
  pendingAnswerEntryId: string | null;
  pendingReview: SharedReviewPrompt | null;
  roomCode?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface RoomEvent {
  id: number;
  at: string;
  kind: string;
  detail: string;
  playerId?: PlayerId;
  requestId?: string;
  context?: Record<string, string | number | boolean | null>;
}

export interface RoomSnapshotPayload {
  state: SharedGameState;
  joinedPlayerIds: PlayerId[];
  events: RoomEvent[];
}

export interface OnlineRoomRecord extends RoomSnapshotPayload {
  roomCode: string;
  seatTokens: Partial<Record<PlayerId, string>>;
  createdAt: string;
  updatedAt: string;
}
