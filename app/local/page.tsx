import { LocalGameClient } from "@/components/local-game-client";
import { createSharedGame } from "@/lib/game-factory";

export default async function LocalPage({
  searchParams,
}: {
  searchParams: Promise<{ puzzle?: string | string[] }>;
}) {
  const params = await searchParams;
  const puzzleId = typeof params.puzzle === "string" ? params.puzzle : params.puzzle?.[0];
  const state = await createSharedGame(puzzleId);

  return <LocalGameClient initialState={state} />;
}
