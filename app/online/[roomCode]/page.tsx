import { OnlineRoomClient } from "@/components/online-room-client";
import { normalizeRoomCode } from "@/lib/room-code";

export default async function OnlineRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ player?: string | string[]; seatToken?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const seatToken =
    typeof resolvedSearchParams.seatToken === "string"
      ? resolvedSearchParams.seatToken
      : resolvedSearchParams.seatToken?.[0];
  const fallbackPlayerId =
    typeof resolvedSearchParams.player === "string"
      ? resolvedSearchParams.player
      : resolvedSearchParams.player?.[0];

  return (
    <OnlineRoomClient
      fallbackPlayerId={fallbackPlayerId === "player2" ? "player2" : "player1"}
      roomCode={normalizeRoomCode(resolvedParams.roomCode)}
      seatToken={seatToken ?? null}
    />
  );
}
