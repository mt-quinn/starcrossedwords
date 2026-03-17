"use client";

import type { PlayerId } from "@/lib/game-types";

export interface RecentRoomSeat {
  roomCode: string;
  playerId: PlayerId;
  seatToken: string;
  lastUsedAt: string;
}

const STORAGE_KEY = "starcrossedwords:recent-room-seats";
const MAX_RECENT_ROOMS = 8;

export function readRecentRoomSeats(): RecentRoomSeat[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RecentRoomSeat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeRecentRoomSeat(nextSeat: RecentRoomSeat) {
  if (typeof window === "undefined") {
    return;
  }

  const currentSeats = readRecentRoomSeats().filter(
    (seat) => !(seat.roomCode === nextSeat.roomCode && seat.playerId === nextSeat.playerId),
  );
  const nextSeats = [nextSeat, ...currentSeats].slice(0, MAX_RECENT_ROOMS);

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSeats));
}

export function findRecentRoomSeat(roomCode: string): RecentRoomSeat | null {
  return readRecentRoomSeats().find((seat) => seat.roomCode === roomCode) ?? null;
}
