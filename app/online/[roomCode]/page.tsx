import { OnlineRoomClient } from "@/components/online-room-client";
import type { PlayerId } from "@/lib/game-types";
import { normalizeRoomCode } from "@/lib/room-code";

function resolvePlayerId(playerParam: string | string[] | undefined): PlayerId {
  const resolved = typeof playerParam === "string" ? playerParam : playerParam?.[0];
  return resolved === "player2" ? "player2" : "player1";
}

export default async function OnlineRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ player?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <OnlineRoomClient
      playerId={resolvePlayerId(resolvedSearchParams.player)}
      roomCode={normalizeRoomCode(resolvedParams.roomCode)}
    />
  );
}
