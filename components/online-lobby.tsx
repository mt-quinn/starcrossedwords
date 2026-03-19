"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PlayerId } from "@/lib/game-types";
import { normalizeRoomCode } from "@/lib/room-code";
import {
  readRecentRoomSeats,
  writeRecentRoomSeat,
  type RecentRoomSeat,
} from "@/lib/rejoin-storage";

export function OnlineLobby({ curatedPuzzleNumbers }: { curatedPuzzleNumbers: number[] }) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [puzzleSelection, setPuzzleSelection] = useState("random");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentSeats, setRecentSeats] = useState<RecentRoomSeat[]>([]);

  useEffect(() => {
    setRecentSeats(readRecentRoomSeats());
  }, []);

  function rememberSeat(roomCode: string, playerId: PlayerId, seatToken: string) {
    writeRecentRoomSeat({
      roomCode,
      playerId,
      seatToken,
      lastUsedAt: new Date().toISOString(),
    });
    setRecentSeats(readRecentRoomSeats());
  }

  async function handleCreateRoom() {
    setIsCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/online-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          puzzleSelection,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        roomCode?: string;
        playerId?: PlayerId;
        seatToken?: string;
      };

      if (!response.ok || !payload.roomCode || !payload.playerId || !payload.seatToken) {
        setErrorMessage(payload.error ?? "Could not create a room.");
        return;
      }

      rememberSeat(payload.roomCode, payload.playerId, payload.seatToken);
      router.push(`/online/${payload.roomCode}?seatToken=${encodeURIComponent(payload.seatToken)}`);
    } catch {
      setErrorMessage("Could not create a room.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoinRoom() {
    const normalizedCode = normalizeRoomCode(roomCode);

    if (!normalizedCode) {
      setErrorMessage("Enter a valid room code first.");
      return;
    }

    setErrorMessage(null);

    try {
      const response = await fetch(`/api/online-room/${normalizedCode}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "identify-seat",
          desiredPlayerId: "player2",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        playerId?: PlayerId;
        seatToken?: string;
      };

      if (!response.ok || !payload.playerId || !payload.seatToken) {
        setErrorMessage(payload.error ?? "Could not join that room.");
        return;
      }

      rememberSeat(normalizedCode, payload.playerId, payload.seatToken);
      router.push(`/online/${normalizedCode}?seatToken=${encodeURIComponent(payload.seatToken)}`);
    } catch {
      setErrorMessage("Could not join that room.");
    }
  }

  return (
    <main className="menu-shell">
      <section className="menu-card">
        <Link className="menu-backlink" href="/">
          Back
        </Link>
        <p className="menu-eyebrow">Play Online</p>
        <h1>Connect with a room code.</h1>
        <p className="menu-copy">
          Create a room to get a shareable code, or enter a code to join as the second player.
        </p>

        <div className="menu-actions">
          <button className="primary-button menu-button" onClick={handleCreateRoom} type="button">
            {isCreating ? "Creating..." : "Create Room"}
          </button>
        </div>

        <label className="menu-field">
          <span>Online Puzzle</span>
          <select onChange={(event) => setPuzzleSelection(event.target.value)} value={puzzleSelection}>
            <option value="random">Random puzzle</option>
            {curatedPuzzleNumbers.map((number) => (
              <option key={number} value={String(number)}>
                Puzzle {number}
              </option>
            ))}
          </select>
        </label>

        <label className="menu-field">
          <span>Join Room</span>
          <input
            maxLength={6}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
            placeholder="ABC123"
            value={roomCode}
          />
        </label>

        <div className="menu-actions">
          <button className="ghost-button menu-button" onClick={handleJoinRoom} type="button">
            Join Room
          </button>
        </div>

        {recentSeats.length ? (
          <div className="menu-actions">
            <p className="menu-eyebrow">Rejoin Recent Room</p>
            {recentSeats.map((seat) => (
              <button
                className="ghost-button menu-button"
                key={`${seat.roomCode}-${seat.playerId}`}
                onClick={() =>
                  router.push(
                    `/online/${seat.roomCode}?seatToken=${encodeURIComponent(seat.seatToken)}`,
                  )
                }
                type="button"
              >
                {seat.roomCode} · {seat.playerId === "player1" ? "Player 1" : "Player 2"}
              </button>
            ))}
          </div>
        ) : null}

        {errorMessage ? <p className="menu-error">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
