import {
  applyBoardChange,
  applyClueSubmission,
  chooseOpeningEntry,
  createEmptyBoard,
  dismissReview as dismissReviewPhase,
  saveClueDraft as saveClueDraftState,
  splitKnownEntryIds,
  submitAnswer as submitAnswerPhase,
} from "@/lib/game-model";
import type {
  OnlineRoomRecord,
  PlayerId,
  RoomEvent,
  RoomSnapshotPayload,
  SharedGameState,
} from "@/lib/game-types";
import { kvDelete, kvGet, kvSet } from "@/lib/redis";

const ROOM_KEY_PREFIX = "room:";
const MAX_EVENT_COUNT = 60;
const VALID_PHASES = new Set(["opening_clue", "answer", "review", "clue"]);

function createSeatToken(): string {
  return crypto.randomUUID();
}

function getRoomKey(roomCode: string) {
  return `${ROOM_KEY_PREFIX}${roomCode}`;
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === "player1" || value === "player2";
}

function normalizeSeatTokens(input: unknown): {
  seatTokens: Partial<Record<PlayerId, string>>;
  changed: boolean;
} {
  if (!input || typeof input !== "object") {
    return { seatTokens: {}, changed: true };
  }

  const source = input as Record<string, unknown>;
  const seatTokens: Partial<Record<PlayerId, string>> = {};

  if (typeof source.player1 === "string" && source.player1) {
    seatTokens.player1 = source.player1;
  }

  if (typeof source.player2 === "string" && source.player2) {
    seatTokens.player2 = source.player2;
  }

  const changed =
    seatTokens.player1 !== source.player1 ||
    seatTokens.player2 !== source.player2 ||
    Object.keys(source).some((key) => key !== "player1" && key !== "player2");

  return { seatTokens, changed };
}

function normalizeJoinedPlayerIds(input: unknown): {
  joinedPlayerIds: PlayerId[];
  changed: boolean;
} {
  if (!Array.isArray(input)) {
    return { joinedPlayerIds: [], changed: true };
  }

  const joinedPlayerIds = Array.from(new Set(input.filter(isPlayerId)));
  return { joinedPlayerIds, changed: joinedPlayerIds.length !== input.length };
}

function normalizeState(
  input: unknown,
  roomCode: string,
  fallbackCreatedAt: string,
  fallbackUpdatedAt: string,
): {
  state: SharedGameState;
  changed: boolean;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Room data is invalid.");
  }

  const source = input as Partial<SharedGameState> & Record<string, unknown>;
  const puzzle = source.puzzle;

  if (
    !puzzle ||
    typeof puzzle !== "object" ||
    !Array.isArray((puzzle as SharedGameState["puzzle"]).cells) ||
    !Array.isArray((puzzle as SharedGameState["puzzle"]).entries)
  ) {
    throw new Error("Room data is invalid.");
  }

  const typedPuzzle = puzzle as SharedGameState["puzzle"];
  const defaultBoard = createEmptyBoard(typedPuzzle);
  const knownEntryIdsByPlayer =
    source.knownEntryIdsByPlayer?.player1 && source.knownEntryIdsByPlayer?.player2
      ? source.knownEntryIdsByPlayer
      : splitKnownEntryIds(typedPuzzle);
  const currentEntryIdByPlayer = {
    player1:
      source.currentEntryIdByPlayer?.player1 ??
      chooseOpeningEntry(knownEntryIdsByPlayer.player1, typedPuzzle.entries),
    player2:
      source.currentEntryIdByPlayer?.player2 ??
      chooseOpeningEntry(knownEntryIdsByPlayer.player2, typedPuzzle.entries),
  };
  const board =
    Array.isArray(source.board) && source.board.length === typedPuzzle.cells.length
      ? source.board.map((value) => (typeof value === "string" ? value : ""))
      : defaultBoard;
  const normalizePlayerDrafts = (playerId: PlayerId) => {
    const sourceDrafts = source.clueDraftsByPlayer?.[playerId];

    if (!sourceDrafts || typeof sourceDrafts !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(sourceDrafts).flatMap(([entryId, draftValue]) => {
        if (!draftValue || typeof draftValue !== "object") {
          return [];
        }

        const draft = draftValue as unknown as Record<string, unknown>;

        if (typeof draft.clue !== "string" || typeof draft.updatedAt !== "number") {
          return [];
        }

        return [[entryId, { clue: draft.clue, updatedAt: draft.updatedAt }]];
      }),
    );
  };
  const clueDraftsByPlayer = {
    player1: normalizePlayerDrafts("player1"),
    player2: normalizePlayerDrafts("player2"),
  };
  const clueHistory =
    source.clueHistory && typeof source.clueHistory === "object" ? source.clueHistory : {};
  const answerHistory =
    source.answerHistory && typeof source.answerHistory === "object" ? source.answerHistory : {};
  const recentTurns = Array.isArray(source.recentTurns) ? source.recentTurns : [];
  const currentTurnPlayerId = isPlayerId(source.currentTurnPlayerId)
    ? source.currentTurnPlayerId
    : "player1";
  const phase =
    typeof source.phase === "string" && VALID_PHASES.has(source.phase)
      ? source.phase
      : "opening_clue";
  const pendingReviewSource = source.pendingReview as unknown as Record<string, unknown> | null;
  const pendingReview =
    pendingReviewSource &&
    typeof pendingReviewSource === "object" &&
    isPlayerId(pendingReviewSource.playerId) &&
    typeof pendingReviewSource.entryId === "string" &&
    typeof pendingReviewSource.answerTurn === "number"
      ? (source.pendingReview as SharedGameState["pendingReview"])
      : null;
  const state: SharedGameState = {
    puzzleId: typeof source.puzzleId === "string" ? source.puzzleId : `${roomCode}.puz`,
    puzzle: typedPuzzle,
    board,
    currentEntryIdByPlayer,
    knownEntryIdsByPlayer,
    clueDraftsByPlayer,
    clueHistory,
    answerHistory,
    recentTurns,
    turnNumber: typeof source.turnNumber === "number" ? source.turnNumber : 0,
    currentTurnPlayerId,
    phase,
    pendingAnswerEntryId:
      typeof source.pendingAnswerEntryId === "string" ? source.pendingAnswerEntryId : null,
    pendingReview,
    roomCode,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : fallbackCreatedAt,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : fallbackUpdatedAt,
    revision: typeof source.revision === "number" ? source.revision : 0,
  };

  const changed =
    source.roomCode !== roomCode ||
    source.currentEntryIdByPlayer?.player1 !== currentEntryIdByPlayer.player1 ||
    source.currentEntryIdByPlayer?.player2 !== currentEntryIdByPlayer.player2 ||
    source.knownEntryIdsByPlayer?.player1 !== knownEntryIdsByPlayer.player1 ||
    source.knownEntryIdsByPlayer?.player2 !== knownEntryIdsByPlayer.player2 ||
    source.clueDraftsByPlayer?.player1 !== clueDraftsByPlayer.player1 ||
    source.clueDraftsByPlayer?.player2 !== clueDraftsByPlayer.player2 ||
    source.board !== board ||
    source.clueHistory !== clueHistory ||
    source.answerHistory !== answerHistory ||
    source.recentTurns !== recentTurns ||
    source.currentTurnPlayerId !== currentTurnPlayerId ||
    source.phase !== phase ||
    source.pendingAnswerEntryId !== state.pendingAnswerEntryId ||
    source.pendingReview !== pendingReview ||
    source.createdAt !== state.createdAt ||
    source.updatedAt !== state.updatedAt ||
    source.revision !== state.revision;

  return { state, changed };
}

function normalizeRoomRecord(
  roomCode: string,
  input: unknown,
): {
  roomRecord: OnlineRoomRecord;
  changed: boolean;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Room data is invalid.");
  }

  const source = input as Partial<OnlineRoomRecord> & Record<string, unknown>;
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString();
  const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : createdAt;
  const { seatTokens, changed: seatTokensChanged } = normalizeSeatTokens(source.seatTokens);
  const { joinedPlayerIds, changed: joinedChanged } = normalizeJoinedPlayerIds(source.joinedPlayerIds);
  const { state, changed: stateChanged } = normalizeState(source.state, roomCode, createdAt, updatedAt);
  const events = Array.isArray(source.events) ? source.events : [];

  return {
    roomRecord: {
      roomCode,
      seatTokens,
      joinedPlayerIds,
      state,
      events,
      createdAt,
      updatedAt,
    },
    changed:
      source.roomCode !== roomCode ||
      source.createdAt !== createdAt ||
      source.updatedAt !== updatedAt ||
      source.events !== events ||
      seatTokensChanged ||
      joinedChanged ||
      stateChanged,
  };
}

function appendEvent(
  events: RoomEvent[],
  kind: string,
  detail: string,
  options?: {
    playerId?: PlayerId;
    requestId?: string;
    context?: Record<string, string | number | boolean | null>;
  },
): RoomEvent[] {
  const nextId = events.at(-1)?.id ?? 0;

  return [
    ...events,
    {
      id: nextId + 1,
      at: new Date().toISOString(),
      kind,
      detail,
      playerId: options?.playerId,
      requestId: options?.requestId,
      context: options?.context,
    },
  ].slice(-MAX_EVENT_COUNT);
}

export async function getOnlineRoom(roomCode: string): Promise<OnlineRoomRecord | null> {
  const storedRoom = await kvGet<unknown>(getRoomKey(roomCode));

  if (!storedRoom) {
    return null;
  }

  const { roomRecord, changed } = normalizeRoomRecord(roomCode, storedRoom);

  if (changed) {
    await kvSet(getRoomKey(roomCode), roomRecord);
  }

  return roomRecord;
}

export async function createOnlineRoom(
  roomCode: string,
  state: SharedGameState,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const existingRoom = await getOnlineRoom(roomCode);

  if (existingRoom) {
    throw new Error("Room already exists.");
  }

  const timestamp = new Date().toISOString();
  const roomRecord: OnlineRoomRecord = {
    roomCode,
    seatTokens: {
      player1: createSeatToken(),
    },
    state: {
      ...state,
      roomCode,
    },
    joinedPlayerIds: ["player1"],
    events: [
      {
        id: 1,
        at: timestamp,
        kind: "create-room",
        detail: "Room created.",
        playerId: "player1",
        requestId: options?.requestId,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await kvSet(getRoomKey(roomCode), roomRecord);
  return roomRecord;
}

export async function identifySeat(
  roomCode: string,
  options: {
    desiredPlayerId?: PlayerId;
    seatToken?: string;
    requestId?: string;
  },
): Promise<{
  room: OnlineRoomRecord;
  playerId: PlayerId;
  seatToken: string;
}> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  if (options.seatToken) {
    const matchingSeat = (["player1", "player2"] as const).find(
      (playerId) => roomRecord.seatTokens[playerId] === options.seatToken,
    );

    if (!matchingSeat) {
      throw new Error("Seat token is invalid for this room.");
    }

    const joinedRoom = await markPlayerJoined(roomCode, matchingSeat, {
      requestId: options.requestId,
    });

    return {
      room: joinedRoom,
      playerId: matchingSeat,
      seatToken: options.seatToken,
    };
  }

  const desiredPlayerId = options.desiredPlayerId;

  if (!desiredPlayerId) {
    throw new Error("No seat information was provided.");
  }

  const existingSeatToken = roomRecord.seatTokens[desiredPlayerId];

  if (existingSeatToken) {
    throw new Error("That seat is already claimed.");
  }

  const updatedRoom: OnlineRoomRecord = {
    ...roomRecord,
    seatTokens: {
      ...roomRecord.seatTokens,
      [desiredPlayerId]: createSeatToken(),
    },
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRoom);
  const joinedRoom = await markPlayerJoined(roomCode, desiredPlayerId, {
    requestId: options.requestId,
  });

  return {
    room: joinedRoom,
    playerId: desiredPlayerId,
    seatToken: updatedRoom.seatTokens[desiredPlayerId] as string,
  };
}

export async function markPlayerJoined(
  roomCode: string,
  playerId: PlayerId,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  const alreadyJoined = roomRecord.joinedPlayerIds.includes(playerId);
  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    joinedPlayerIds: alreadyJoined
      ? roomRecord.joinedPlayerIds
      : [...roomRecord.joinedPlayerIds, playerId],
    events: alreadyJoined
      ? roomRecord.events
      : appendEvent(roomRecord.events, "join-room", `${playerId} joined the room.`, {
          playerId,
          requestId: options?.requestId,
        }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export async function updateOnlineRoomBoard(
  roomCode: string,
  playerId: PlayerId,
  board: string[],
  expectedRevision: number,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  if (roomRecord.state.revision !== expectedRevision) {
    throw new Error("Revision mismatch.");
  }

  const nextState = applyBoardChange(roomRecord.state, playerId, board);
  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: nextState,
    events: appendEvent(roomRecord.events, "update-board", "Board updated.", {
      playerId,
      requestId: options?.requestId,
      context: {
        expectedRevision,
        nextRevision: nextState.revision,
      },
    }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export async function saveClueDraft(
  roomCode: string,
  playerId: PlayerId,
  entryId: string,
  clue: string,
  updatedAt: number,
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  const nextState = saveClueDraftState(roomRecord.state, playerId, entryId, clue, updatedAt);

  if (nextState === roomRecord.state) {
    return roomRecord;
  }

  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: nextState,
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export async function submitOnlineRoomClue(
  roomCode: string,
  playerId: PlayerId,
  entryId: string,
  clue: string,
  expectedRevision: number,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  if (roomRecord.state.revision !== expectedRevision) {
    throw new Error("Revision mismatch.");
  }

  const nextState = applyClueSubmission(roomRecord.state, playerId, entryId, clue);
  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: nextState,
    events: appendEvent(roomRecord.events, "submit-clue", `Clued ${entryId}.`, {
      playerId,
      requestId: options?.requestId,
      context: {
        entryId,
        expectedRevision,
        nextRevision: nextState.revision,
      },
    }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export async function submitAnswer(
  roomCode: string,
  playerId: PlayerId,
  expectedRevision: number,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  if (roomRecord.state.revision !== expectedRevision) {
    throw new Error("Revision mismatch.");
  }

  const nextState = submitAnswerPhase(roomRecord.state, playerId);
  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: nextState,
    events: appendEvent(roomRecord.events, "submit-answer", "Submitted answer.", {
      playerId,
      requestId: options?.requestId,
      context: {
        nextRevision: nextState.revision,
        phase: nextState.phase,
      },
    }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export async function dismissReview(
  roomCode: string,
  playerId: PlayerId,
  expectedRevision: number,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  if (roomRecord.state.revision !== expectedRevision) {
    throw new Error("Revision mismatch.");
  }

  const nextState = dismissReviewPhase(roomRecord.state, playerId);
  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: nextState,
    events: appendEvent(roomRecord.events, "dismiss-review", "Dismissed review prompt.", {
      playerId,
      requestId: options?.requestId,
      context: {
        nextRevision: nextState.revision,
      },
    }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export function toRoomSnapshotPayload(roomRecord: OnlineRoomRecord): RoomSnapshotPayload {
  return {
    state: roomRecord.state,
    joinedPlayerIds: roomRecord.joinedPlayerIds,
    events: roomRecord.events,
  };
}

export function buildRoomDebugReport(roomRecord: OnlineRoomRecord) {
  return {
    roomCode: roomRecord.roomCode,
    createdAt: roomRecord.createdAt,
    updatedAt: roomRecord.updatedAt,
    joinedPlayerIds: roomRecord.joinedPlayerIds,
    state: roomRecord.state,
    events: roomRecord.events,
  };
}

export async function deleteOnlineRoom(roomCode: string): Promise<void> {
  await kvDelete(getRoomKey(roomCode));
}

export async function resetOnlineRoom(
  roomCode: string,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  const resetState: SharedGameState = {
    ...roomRecord.state,
    board: createEmptyBoard(roomRecord.state.puzzle),
    currentEntryIdByPlayer: {
      player1: chooseOpeningEntry(
        roomRecord.state.knownEntryIdsByPlayer.player1,
        roomRecord.state.puzzle.entries,
      ),
      player2: chooseOpeningEntry(
        roomRecord.state.knownEntryIdsByPlayer.player2,
        roomRecord.state.puzzle.entries,
      ),
    },
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
    updatedAt: new Date().toISOString(),
    revision: roomRecord.state.revision + 1,
  };

  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: resetState,
    joinedPlayerIds: ["player1"],
    events: appendEvent(roomRecord.events, "reset-room", "Room reset to opening state.", {
      playerId: "player1",
      requestId: options?.requestId,
      context: {
        nextRevision: resetState.revision,
      },
    }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}

export async function forceOnlineRoomTurn(
  roomCode: string,
  playerId: PlayerId,
  options?: {
    requestId?: string;
  },
): Promise<OnlineRoomRecord> {
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    throw new Error("Room not found.");
  }

  const nextState: SharedGameState = {
    ...roomRecord.state,
    currentTurnPlayerId: playerId,
    updatedAt: new Date().toISOString(),
    revision: roomRecord.state.revision + 1,
  };

  const updatedRecord: OnlineRoomRecord = {
    ...roomRecord,
    state: nextState,
    events: appendEvent(roomRecord.events, "force-turn", `Forced turn to ${playerId}.`, {
      playerId,
      requestId: options?.requestId,
      context: {
        nextRevision: nextState.revision,
      },
    }),
    updatedAt: new Date().toISOString(),
  };

  await kvSet(getRoomKey(roomCode), updatedRecord);
  return updatedRecord;
}
