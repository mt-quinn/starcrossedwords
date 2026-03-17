import { NextResponse } from "next/server";

import { createSharedGame } from "@/lib/game-factory";
import { createOnlineRoom } from "@/lib/online-room-store";
import { generateRoomCode } from "@/lib/room-code";

const MAX_ROOM_CREATION_ATTEMPTS = 8;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => ({}))) as {
    puzzleId?: string;
  };

  for (let attempt = 0; attempt < MAX_ROOM_CREATION_ATTEMPTS; attempt += 1) {
    const roomCode = generateRoomCode();
    const initialState = await createSharedGame(body.puzzleId);

    try {
      await createOnlineRoom(roomCode, initialState, { requestId });

      return NextResponse.json({
        requestId,
        roomCode,
        playerId: "player1",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Room already exists.") {
        continue;
      }

      return NextResponse.json(
        {
          requestId,
          error: error instanceof Error ? error.message : "Room creation failed.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { requestId, error: "Could not allocate a unique room code." },
    { status: 500 },
  );
}
