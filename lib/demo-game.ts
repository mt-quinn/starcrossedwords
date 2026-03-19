import { createSharedGame } from "@/lib/game-factory";
import { buildGameViewForPlayer } from "@/lib/game-model";
import type { ClueEvent, GameView, TurnSummary } from "@/lib/game-types";

export type DemoGame = GameView;

export async function getDemoGame(puzzleSelection?: string): Promise<DemoGame> {
  const state = await createSharedGame(puzzleSelection);
  const game = buildGameViewForPlayer(state, "player1");

  return {
    ...game,
    matchLabel: state.puzzleId,
  };
}

export type { ClueEvent, TurnSummary };
