import { NextResponse } from "next/server";

import { getOnlineRoom } from "@/lib/online-room-store";
import { hasKvEnv, hasRedisEnv, hasUpstashEnv } from "@/lib/redis";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const roomCode = requestUrl.searchParams.get("room");
  const roomRecord = roomCode ? await getOnlineRoom(roomCode.toUpperCase()) : null;

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    env: {
      hasRedis: hasRedisEnv(),
      hasKV: hasKvEnv(),
      hasUpstash: hasUpstashEnv(),
      KV_REST_API_URL: redactUrl(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: redactToken(process.env.KV_REST_API_TOKEN),
      UPSTASH_REDIS_REST_URL: redactUrl(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: redactToken(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
    room: roomRecord
      ? {
          roomCode: roomRecord.roomCode,
          revision: roomRecord.state.revision,
          turnNumber: roomRecord.state.turnNumber,
          currentTurnPlayerId: roomRecord.state.currentTurnPlayerId,
          joinedPlayerIds: roomRecord.joinedPlayerIds,
          eventCount: roomRecord.events.length,
          updatedAt: roomRecord.updatedAt,
        }
      : null,
  });
}
