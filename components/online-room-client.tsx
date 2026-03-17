"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GameShell } from "@/components/game-shell";
import { buildGameViewForPlayer, playerLabel } from "@/lib/game-model";
import type { PlayerId, RoomSnapshotPayload, TurnPhase } from "@/lib/game-types";
import { findRecentRoomSeat, writeRecentRoomSeat } from "@/lib/rejoin-storage";

function waitingHeadline(activePlayerId: PlayerId, phase: TurnPhase): string {
  const activePlayer = playerLabel(activePlayerId);

  if (phase === "answer") {
    return `${activePlayer} is answering your clue`;
  }

  if (phase === "review") {
    return `${activePlayer} is reviewing the submitted fill`;
  }

  return `${activePlayer} is writing a clue`;
}

function waitingBody(phase: TurnPhase): string {
  if (phase === "answer") {
    return "You can still inspect the board while they fill their entry.";
  }

  if (phase === "review") {
    return "You can still inspect the board and your bank while they decide whether to reclue.";
  }

  return "You can still inspect the board and your bank while they prepare the next clue.";
}

export function OnlineRoomClient({
  fallbackPlayerId,
  roomCode,
  seatToken,
}: {
  fallbackPlayerId: PlayerId;
  roomCode: string;
  seatToken: string | null;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<RoomSnapshotPayload | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [resolvedSeatToken, setResolvedSeatToken] = useState<string | null>(seatToken);
  const [connectionState, setConnectionState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [debugDump, setDebugDump] = useState<string>("");
  const [smokeReport, setSmokeReport] = useState<string>("");
  const [debugActionState, setDebugActionState] = useState<string | null>(null);

  const roomApiPath = useMemo(() => `/api/online-room/${roomCode}`, [roomCode]);
  const debugRoomPath = useMemo(() => `/api/debug/room/${roomCode}`, [roomCode]);

  function scheduleCopyStatus(message: string) {
    setCopyStatus(message);
    window.setTimeout(() => {
      setCopyStatus((currentValue) => (currentValue === message ? null : currentValue));
    }, 1600);
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      scheduleCopyStatus(`${label} copied`);
    } catch {
      scheduleCopyStatus(`${label} copy failed`);
    }
  }

  const identifySeat = useCallback(async () => {
    const rememberedSeat = resolvedSeatToken ? null : findRecentRoomSeat(roomCode);
    const nextSeatToken = resolvedSeatToken ?? rememberedSeat?.seatToken ?? null;

    setConnectionState("loading");

    try {
      const response = await fetch(roomApiPath, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "identify-seat",
          desiredPlayerId: nextSeatToken ? undefined : fallbackPlayerId,
          seatToken: nextSeatToken,
        }),
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        requestId?: string;
        error?: string;
        playerId?: PlayerId;
        seatToken?: string;
        state?: RoomSnapshotPayload["state"];
        joinedPlayerIds?: PlayerId[];
        events?: RoomSnapshotPayload["events"];
      };

      if (
        !response.ok ||
        !payload.playerId ||
        !payload.seatToken ||
        !("state" in payload) ||
        !payload.state
      ) {
        setConnectionState("error");
        setErrorMessage(payload.error ?? "Could not claim a seat in that room.");
        return;
      }

      setPlayerId(payload.playerId);
      setResolvedSeatToken(payload.seatToken);
      writeRecentRoomSeat({
        roomCode,
        playerId: payload.playerId,
        seatToken: payload.seatToken,
        lastUsedAt: new Date().toISOString(),
      });
      router.replace(`/online/${roomCode}?seatToken=${encodeURIComponent(payload.seatToken)}`);
      setSnapshot({
        state: payload.state,
        joinedPlayerIds: payload.joinedPlayerIds ?? [],
        events: payload.events ?? [],
      });
      setLastSyncedAt(new Date().toISOString());
      setConnectionState("idle");
      setErrorMessage(null);
    } catch {
      setConnectionState("error");
      setErrorMessage("Could not claim a seat in that room.");
    }
  }, [fallbackPlayerId, resolvedSeatToken, roomApiPath, roomCode, router]);

  const loadSnapshot = useCallback(
    async () => {
      if (!playerId) {
        return;
      }

      setConnectionState((currentValue) => (currentValue === "saving" ? currentValue : "loading"));

      try {
        const response = await fetch(roomApiPath, {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => ({}))) as {
          requestId?: string;
          error?: string;
          snapshot?: RoomSnapshotPayload | null;
          state?: RoomSnapshotPayload["state"];
          joinedPlayerIds?: PlayerId[];
          events?: RoomSnapshotPayload["events"];
        };

        if (!response.ok) {
          if (payload.snapshot) {
            setSnapshot(payload.snapshot);
          }
          setConnectionState("error");
          setErrorMessage(payload.error ?? "Could not load that room.");
          return;
        }

        const nextSnapshot = "state" in payload
          ? (payload as RoomSnapshotPayload)
          : payload.snapshot;

        if (nextSnapshot) {
          setSnapshot(nextSnapshot);
          setLastSyncedAt(new Date().toISOString());
        }

        setConnectionState("idle");
        setErrorMessage(null);
      } catch {
        setConnectionState("error");
        setErrorMessage("Could not load that room.");
      }
    },
    [playerId, roomApiPath],
  );

  useEffect(() => {
    void identifySeat();
  }, [identifySeat]);

  useEffect(() => {
    if (!playerId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSnapshot();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadSnapshot]);

  async function mutateRoom(payload: {
    action: "update-board" | "submit-clue" | "submit-answer" | "dismiss-review";
    board?: string[];
    entryId?: string;
    clue?: string;
  }) {
    if (!snapshot) {
      return;
    }

    setConnectionState("saving");

    try {
      const response = await fetch(roomApiPath, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          playerId,
          expectedRevision: snapshot.state.revision,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        requestId?: string;
        error?: string;
        snapshot?: RoomSnapshotPayload | null;
        state?: RoomSnapshotPayload["state"];
        joinedPlayerIds?: PlayerId[];
        events?: RoomSnapshotPayload["events"];
      };

      const nextSnapshot = "state" in result
        ? (result as RoomSnapshotPayload)
        : result.snapshot;

      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
        setLastSyncedAt(new Date().toISOString());
      }

      if (!response.ok) {
        setConnectionState("error");
        setErrorMessage(result.error ?? "Room update failed.");
        return;
      }

      setConnectionState("idle");
      setErrorMessage(null);
    } catch {
      setConnectionState("error");
      setErrorMessage("Room update failed.");
    }
  }

  const loadDebugDump = useCallback(async () => {
    try {
      const response = await fetch(debugRoomPath, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({ error: "Could not parse debug room payload." }));
      setDebugDump(JSON.stringify(payload, null, 2));
    } catch {
      setDebugDump(JSON.stringify({ error: "Could not load room debug report." }, null, 2));
    }
  }, [debugRoomPath]);

  useEffect(() => {
    if (isDebugOpen) {
      void loadDebugDump();
    }
  }, [isDebugOpen, loadDebugDump]);

  async function runDebugAction(body: unknown, label: string) {
    setDebugActionState(label);

    try {
      const response = await fetch(debugRoomPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({ error: "Could not parse debug action payload." }));
      const payloadText = JSON.stringify(payload, null, 2);

      setDebugDump(payloadText);
      await loadSnapshot();
      scheduleCopyStatus(`${label} complete`);
    } catch {
      setDebugDump(JSON.stringify({ error: `${label} failed.` }, null, 2));
      scheduleCopyStatus(`${label} failed`);
    } finally {
      setDebugActionState(null);
    }
  }

  async function runSmokeTest() {
    setDebugActionState("smoke-test");

    try {
      const response = await fetch("/api/debug/network-smoke", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({ error: "Could not parse smoke test payload." }));
      setSmokeReport(JSON.stringify(payload, null, 2));
      scheduleCopyStatus(response.ok ? "Smoke test ready" : "Smoke test failed");
    } catch {
      setSmokeReport(JSON.stringify({ error: "Smoke test failed." }, null, 2));
      scheduleCopyStatus("Smoke test failed");
    } finally {
      setDebugActionState(null);
    }
  }

  const game = snapshot && playerId ? buildGameViewForPlayer(snapshot.state, playerId) : null;
  const isTurnActive = snapshot?.state.currentTurnPlayerId === playerId;

  if (!game) {
    return (
      <main className="menu-shell">
        <section className="menu-card">
          <p className="menu-eyebrow">Online Room</p>
          <h1>{roomCode}</h1>
          <p className="menu-copy">{errorMessage ?? "Loading room state..."}</p>
        </section>
      </main>
    );
  }

  const activeSnapshot = snapshot as RoomSnapshotPayload;
  const activePlayerId = playerId as PlayerId;
  const fullDiagnostics = JSON.stringify(
    {
      roomCode,
      playerId: activePlayerId,
      seatToken: resolvedSeatToken,
      connectionState,
      lastSyncedAt,
      latestError: errorMessage,
      snapshot: activeSnapshot,
      roomDump: debugDump ? JSON.parse(debugDump) : null,
      smokeReport: smokeReport ? JSON.parse(smokeReport) : null,
    },
    null,
    2,
  );

  return (
    <>
      <GameShell
        game={game}
        interactionLocked={!isTurnActive}
        onBoardChange={(board) => {
          void mutateRoom({
            action: "update-board",
            board,
          });
        }}
        onSubmitAnswer={() => {
          void mutateRoom({
            action: "submit-answer",
          });
        }}
        onDismissReview={() => {
          void mutateRoom({
            action: "dismiss-review",
          });
        }}
        onSendClue={(entryId, clue) => {
          void mutateRoom({
            action: "submit-clue",
            entryId,
            clue,
          });
        }}
      />

      <div className={["floating-status-chip", isTurnActive ? "is-turn-active" : "is-waiting"].join(" ")}>
        <strong>{roomCode}</strong>
        <span>{playerLabel(activePlayerId)}</span>
        <span>{isTurnActive ? "Your turn" : "Waiting"}</span>
      </div>

      {!isTurnActive ? (
        <section className="turn-state-banner" aria-live="polite">
          <p className="turn-state-label">Not your turn</p>
          <h2>{waitingHeadline(activeSnapshot.state.currentTurnPlayerId, activeSnapshot.state.phase)}</h2>
          <p>{waitingBody(activeSnapshot.state.phase)}</p>
        </section>
      ) : null}

      <button
        aria-expanded={isDebugOpen}
        className="floating-debug-toggle"
        onClick={() => setIsDebugOpen((currentValue) => !currentValue)}
        type="button"
      >
        Debug
      </button>

      {isDebugOpen ? (
        <aside className="network-debug-panel">
          <div className="network-debug-header">
            <strong>Room Debug</strong>
            <div className="debug-inline-actions">
              <button className="ghost-button compact-button" onClick={() => void loadSnapshot()} type="button">
                Refresh
              </button>
              <button className="ghost-button compact-button" onClick={() => setIsDebugOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="network-debug-block">
            <p className="sheet-label">Connection</p>
            <p className="network-debug-line">State: {connectionState}</p>
            <p className="network-debug-line">Last sync: {lastSyncedAt ?? "Never"}</p>
            <p className="network-debug-line">Revision: {activeSnapshot.state.revision}</p>
            <p className="network-debug-line">Turn: {activeSnapshot.state.turnNumber}</p>
            <p className="network-debug-line">
              Active player: {playerLabel(activeSnapshot.state.currentTurnPlayerId)}
            </p>
            <p className="network-debug-line">Current player view: {playerLabel(activePlayerId)}</p>
          </div>

          <div className="network-debug-block">
            <p className="sheet-label">Joined Seats</p>
            {(["player1", "player2"] as const).map((seat) => (
              <p className="network-debug-line" key={seat}>
                {playerLabel(seat)}: {activeSnapshot.joinedPlayerIds.includes(seat) ? "joined" : "open"}
              </p>
            ))}
          </div>

          <div className="network-debug-block">
            <p className="sheet-label">Quick Copy</p>
            <div className="debug-inline-actions">
              <button
                className="ghost-button compact-button"
                onClick={() => void copyText("Snapshot", JSON.stringify(activeSnapshot, null, 2))}
                type="button"
              >
                Copy Snapshot
              </button>
              <button
                className="ghost-button compact-button"
                onClick={() =>
                  void copyText(
                    "Room URLs",
                    [
                      `${window.location.origin}/api/online-room/${roomCode}`,
                      `${window.location.origin}/api/debug/room/${roomCode}`,
                      `${window.location.origin}/api/debug/storage?room=${roomCode}`,
                      `${window.location.origin}/online/${roomCode}?seatToken=${encodeURIComponent(resolvedSeatToken ?? "")}`,
                    ].join("\n"),
                  )
                }
                type="button"
              >
                Copy URLs
              </button>
              <button
                className="ghost-button compact-button"
                onClick={() => void copyText("Full diagnostics", fullDiagnostics)}
                type="button"
              >
                Copy All
              </button>
            </div>
            {copyStatus ? <p className="network-debug-line">{copyStatus}</p> : null}
          </div>

          <div className="network-debug-block">
            <p className="sheet-label">Recent Events</p>
            {activeSnapshot.events.slice(-8).reverse().map((event) => (
              <p className="network-debug-line" key={event.id}>
                #{event.id} {event.kind}: {event.detail}
                {event.requestId ? ` (${event.requestId})` : ""}
              </p>
            ))}
          </div>

          <div className="network-debug-block">
            <p className="sheet-label">Debug Actions</p>
            <div className="debug-inline-actions">
              <button
                className="ghost-button compact-button"
                disabled={Boolean(debugActionState)}
                onClick={() => void loadDebugDump()}
                type="button"
              >
                Reload Dump
              </button>
              <button
                className="ghost-button compact-button"
                disabled={Boolean(debugActionState)}
                onClick={() => void runDebugAction({ action: "reset-room" }, "reset-room")}
                type="button"
              >
                Reset Room
              </button>
              <button
                className="ghost-button compact-button"
                disabled={Boolean(debugActionState)}
                onClick={() =>
                  void runDebugAction(
                    {
                      action: "force-turn",
                      playerId: activePlayerId === "player1" ? "player2" : "player1",
                    },
                    "force-turn",
                  )
                }
                type="button"
              >
                Force Turn
              </button>
              <button
                className="ghost-button compact-button"
                disabled={Boolean(debugActionState)}
                onClick={() => void runSmokeTest()}
                type="button"
              >
                Run Smoke
              </button>
              <button
                className="ghost-button compact-button"
                disabled={Boolean(debugActionState)}
                onClick={() => void runDebugAction({ action: "delete-room" }, "delete-room")}
                type="button"
              >
                Delete Room
              </button>
            </div>
            {debugActionState ? <p className="network-debug-line">Running: {debugActionState}</p> : null}
          </div>

          <div className="network-debug-block">
            <div className="debug-inline-actions">
              <p className="sheet-label">Room Dump JSON</p>
              <button
                className="ghost-button compact-button"
                onClick={() => void copyText("Room dump", debugDump)}
                type="button"
              >
                Copy Dump
              </button>
            </div>
            <textarea className="debug-textarea" readOnly value={debugDump} />
          </div>

          <div className="network-debug-block">
            <div className="debug-inline-actions">
              <p className="sheet-label">Smoke Test JSON</p>
              <button
                className="ghost-button compact-button"
                onClick={() => void copyText("Smoke report", smokeReport)}
                type="button"
              >
                Copy Smoke
              </button>
            </div>
            <textarea className="debug-textarea" readOnly value={smokeReport} />
          </div>

          {errorMessage ? (
            <div className="network-debug-block">
              <p className="sheet-label">Latest Error</p>
              <p className="network-debug-line">{errorMessage}</p>
            </div>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}
