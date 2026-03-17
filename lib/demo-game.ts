import path from "node:path";

import { createSharedGame } from "@/lib/game-factory";
import { buildGameViewForPlayer } from "@/lib/game-model";
import type { ClueEvent, GameView, TurnSummary } from "@/lib/game-types";

export type DemoGame = GameView;

export async function getDemoGame(puzzleId?: string): Promise<DemoGame> {
  const state = await createSharedGame(puzzleId);
  const game = buildGameViewForPlayer(state, "player1");

  return {
    ...game,
    matchLabel: path.basename(state.puzzleId, ".puz"),
  };
}

export type { ClueEvent, TurnSummary };
