import { NextResponse } from "next/server";

import {
  dismissReview,
  getOnlineRoom,
  markPlayerJoined,
  submitAnswer,
  submitOnlineRoomClue,
  toRoomSnapshotPayload,
  updateOnlineRoomBoard,
} from "@/lib/online-room-store";
import type { PlayerId } from "@/lib/game-types";
import { normalizeRoomCode } from "@/lib/room-code";

export const runtime = "nodejs";

type PatchBody =
  | {
      action: "join";
      playerId: PlayerId;
    }
  | {
      action: "update-board";
      playerId: PlayerId;
      board: string[];
      expectedRevision: number;
    }
  | {
      action: "submit-answer";
      playerId: PlayerId;
      expectedRevision: number;
    }
  | {
      action: "dismiss-review";
      playerId: PlayerId;
      expectedRevision: number;
    }
  | {
      action: "submit-clue";
      playerId: PlayerId;
      entryId: string;
      clue: string;
      expectedRevision: number;
    };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const requestId = crypto.randomUUID();
  const { roomCode: rawRoomCode } = await params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    return NextResponse.json({ requestId, error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({
    requestId,
    ...toRoomSnapshotPayload(roomRecord),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const requestId = crypto.randomUUID();
  const { roomCode: rawRoomCode } = await params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const body = (await request.json()) as PatchBody;

  try {
    if (body.action === "join") {
      const roomRecord = await markPlayerJoined(roomCode, body.playerId, { requestId });
      return NextResponse.json({
        requestId,
        ...toRoomSnapshotPayload(roomRecord),
      });
    }

    if (body.action === "update-board") {
      const roomRecord = await updateOnlineRoomBoard(
        roomCode,
        body.playerId,
        body.board,
        body.expectedRevision,
        { requestId },
      );
      return NextResponse.json({
        requestId,
        ...toRoomSnapshotPayload(roomRecord),
      });
    }

    if (body.action === "submit-answer") {
      const roomRecord = await submitAnswer(roomCode, body.playerId, body.expectedRevision, {
        requestId,
      });
      return NextResponse.json({
        requestId,
        ...toRoomSnapshotPayload(roomRecord),
      });
    }

    if (body.action === "dismiss-review") {
      const roomRecord = await dismissReview(roomCode, body.playerId, body.expectedRevision, {
        requestId,
      });
      return NextResponse.json({
        requestId,
        ...toRoomSnapshotPayload(roomRecord),
      });
    }

    const roomRecord = await submitOnlineRoomClue(
      roomCode,
      body.playerId,
      body.entryId,
      body.clue,
      body.expectedRevision,
      { requestId },
    );
    return NextResponse.json({
      requestId,
      ...toRoomSnapshotPayload(roomRecord),
    });
  } catch (error) {
    const roomRecord = await getOnlineRoom(roomCode);
    const message = error instanceof Error ? error.message : "Room mutation failed.";
    const status = message === "Room not found." ? 404 : message === "Revision mismatch." ? 409 : 400;

    return NextResponse.json(
      {
        requestId,
        error: message,
        snapshot: roomRecord ? toRoomSnapshotPayload(roomRecord) : null,
      },
      { status },
    );
  }
}
