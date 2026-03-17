import { applyBoardChange, applyClueSubmission, chooseOpeningEntry, createEmptyBoard } from "@/lib/game-model";
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

function getRoomKey(roomCode: string) {
  return `${ROOM_KEY_PREFIX}${roomCode}`;
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
  return await kvGet<OnlineRoomRecord>(getRoomKey(roomCode));
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
    clueHistory: {},
    recentTurns: [],
    turnNumber: 0,
    currentTurnPlayerId: "player1",
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
