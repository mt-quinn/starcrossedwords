import { NextResponse } from "next/server";

import {
  buildRoomDebugReport,
  deleteOnlineRoom,
  forceOnlineRoomTurn,
  getOnlineRoom,
  markPlayerJoined,
  resetOnlineRoom,
} from "@/lib/online-room-store";
import { hasKvEnv, hasRedisEnv, hasUpstashEnv } from "@/lib/redis";
import type { PlayerId } from "@/lib/game-types";
import { normalizeRoomCode } from "@/lib/room-code";

export const runtime = "nodejs";

type DebugActionBody =
  | { action: "reset-room" }
  | { action: "delete-room" }
  | { action: "force-turn"; playerId: PlayerId }
  | { action: "force-join"; playerId: PlayerId };

function redactUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url.length <= 12 ? "[set]" : `${url.slice(0, 6)}...${url.slice(-4)}`;
  }
}

function redactToken(token: string | undefined): string | null {
  if (!token) {
    return null;
  }

  if (token.length <= 8) {
    return "[set]";
  }

  return `${token.slice(0, 3)}...${token.slice(-3)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const requestId = crypto.randomUUID();
  const requestUrl = new URL(request.url);
  const { roomCode: rawRoomCode } = await params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const roomRecord = await getOnlineRoom(roomCode);

  if (!roomRecord) {
    return NextResponse.json({ requestId, error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({
    requestId,
    now: new Date().toISOString(),
    debug: {
      roomUrl: `/online/${roomCode}?player=player1`,
      player2Url: `/online/${roomCode}?player=player2`,
      apiUrl: `/api/online-room/${roomCode}`,
      storageUrl: `/api/debug/storage?room=${roomCode}`,
      smokeUrl: `/api/debug/network-smoke`,
      curlExamples: {
        fetchRoom: `curl "${requestUrl.origin}/api/online-room/${roomCode}"`,
        debugDump: `curl "${requestUrl.origin}/api/debug/room/${roomCode}"`,
        forceTurn: `curl -X POST "${requestUrl.origin}/api/debug/room/${roomCode}" -H "Content-Type: application/json" -d '{"action":"force-turn","playerId":"player1"}'`,
        resetRoom: `curl -X POST "${requestUrl.origin}/api/debug/room/${roomCode}" -H "Content-Type: application/json" -d '{"action":"reset-room"}'`,
      },
      includeBoard: requestUrl.searchParams.get("board") !== "0",
    },
    env: {
      hasRedis: hasRedisEnv(),
      hasKV: hasKvEnv(),
      hasUpstash: hasUpstashEnv(),
      KV_REST_API_URL: redactUrl(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: redactToken(process.env.KV_REST_API_TOKEN),
      UPSTASH_REDIS_REST_URL: redactUrl(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: redactToken(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
    room: buildRoomDebugReport(roomRecord),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const requestId = crypto.randomUUID();
  const { roomCode: rawRoomCode } = await params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const body = (await request.json()) as DebugActionBody;

  try {
    if (body.action === "delete-room") {
      await deleteOnlineRoom(roomCode);
      return NextResponse.json({
        requestId,
        ok: true,
        action: body.action,
        roomCode,
      });
    }

    if (body.action === "reset-room") {
      const roomRecord = await resetOnlineRoom(roomCode, { requestId });
      return NextResponse.json({
        requestId,
        ok: true,
        action: body.action,
        room: buildRoomDebugReport(roomRecord),
      });
    }

    if (body.action === "force-turn") {
      const roomRecord = await forceOnlineRoomTurn(roomCode, body.playerId, { requestId });
      return NextResponse.json({
        requestId,
        ok: true,
        action: body.action,
        room: buildRoomDebugReport(roomRecord),
      });
    }

    const roomRecord = await markPlayerJoined(roomCode, body.playerId, { requestId });
    return NextResponse.json({
      requestId,
      ok: true,
      action: body.action,
      room: buildRoomDebugReport(roomRecord),
    });
  } catch (error) {
    return NextResponse.json(
      {
        requestId,
        error: error instanceof Error ? error.message : "Debug room action failed.",
      },
      { status: 400 },
    );
  }
}
