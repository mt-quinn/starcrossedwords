"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { normalizeRoomCode } from "@/lib/room-code";

export function OnlineLobby() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCreateRoom() {
    setIsCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/online-room", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        roomCode?: string;
      };

      if (!response.ok || !payload.roomCode) {
        setErrorMessage(payload.error ?? "Could not create a room.");
        return;
      }

      router.push(`/online/${payload.roomCode}?player=player1`);
    } catch {
      setErrorMessage("Could not create a room.");
    } finally {
      setIsCreating(false);
    }
  }

  function handleJoinRoom() {
    const normalizedCode = normalizeRoomCode(roomCode);

    if (!normalizedCode) {
      setErrorMessage("Enter a valid room code first.");
      return;
    }

    setErrorMessage(null);
    router.push(`/online/${normalizedCode}?player=player2`);
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

        {errorMessage ? <p className="menu-error">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
