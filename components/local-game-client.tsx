"use client";

import { useMemo, useState } from "react";

import { GameShell } from "@/components/game-shell";
import {
  applyBoardChange,
  applyClueSubmission,
  buildGameViewForPlayer,
  dismissReview,
  playerLabel,
  submitAnswer,
} from "@/lib/game-model";
import type { SharedGameState } from "@/lib/game-types";

export function LocalGameClient({ initialState }: { initialState: SharedGameState }) {
  const [state, setState] = useState(initialState);
  const viewer = state.currentTurnPlayerId;
  const game = useMemo(() => buildGameViewForPlayer(state, viewer), [state, viewer]);

  return (
    <>
      <GameShell
        game={game}
        key={viewer}
        onBoardChange={(board) => {
          setState((currentState) => applyBoardChange(currentState, viewer, board));
        }}
        onSubmitAnswer={() => {
          setState((currentState) => submitAnswer(currentState, viewer));
        }}
        onDismissReview={() => {
          setState((currentState) => dismissReview(currentState, viewer));
        }}
        onSendClue={(entryId, clue) => {
          setState((currentState) => applyClueSubmission(currentState, viewer, entryId, clue));
        }}
      />
      <div className="floating-status-chip">
        <strong>Test Local</strong>
        <span>{playerLabel(viewer)} turn</span>
      </div>
    </>
  );
}
