import { NextResponse } from "next/server";

import { getOnlineRoom } from "@/lib/online-room-store";

export const runtime = "nodejs";

async function readJsonSafe(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const cleanup = requestUrl.searchParams.get("cleanup") !== "0";
  const steps: Array<{
    name: string;
    status: number;
    ok: boolean;
    body: unknown;
  }> = [];
  let roomCode: string | null = null;

  try {
    const createResponse = await fetch(`${origin}/api/online-room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const createBody = (await readJsonSafe(createResponse)) as {
      roomCode?: string;
    } | null;
    roomCode = createBody?.roomCode ?? null;
    steps.push({
      name: "create-room",
      status: createResponse.status,
      ok: createResponse.ok,
      body: createBody,
    });

    if (!roomCode) {
      return NextResponse.json({ requestId, ok: false, steps }, { status: 500 });
    }

    const getResponse = await fetch(`${origin}/api/online-room/${roomCode}`, {
      method: "GET",
      cache: "no-store",
    });
    steps.push({
      name: "fetch-room",
      status: getResponse.status,
      ok: getResponse.ok,
      body: await readJsonSafe(getResponse),
    });

    const joinResponse = await fetch(`${origin}/api/online-room/${roomCode}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "join",
        playerId: "player2",
      }),
      cache: "no-store",
    });
    steps.push({
      name: "join-player2",
      status: joinResponse.status,
      ok: joinResponse.ok,
      body: await readJsonSafe(joinResponse),
    });

    const badUpdateResponse = await fetch(`${origin}/api/online-room/${roomCode}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "update-board",
        playerId: "player2",
        board: [],
        expectedRevision: 0,
      }),
      cache: "no-store",
    });
    steps.push({
      name: "reject-wrong-turn-update",
      status: badUpdateResponse.status,
      ok: badUpdateResponse.ok,
      body: await readJsonSafe(badUpdateResponse),
    });

    const roomRecord = await getOnlineRoom(roomCode);
    const clueEntryId = roomRecord?.state.knownEntryIdsByPlayer.player1[0];

    if (!clueEntryId) {
      return NextResponse.json(
        { requestId, ok: false, steps, error: "Could not find a clueable player1 entry." },
        { status: 500 },
      );
    }

    const clueResponse = await fetch(`${origin}/api/online-room/${roomCode}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "submit-clue",
        playerId: "player1",
        entryId: clueEntryId,
        clue: "Smoke test clue",
        expectedRevision: roomRecord.state.revision,
      }),
      cache: "no-store",
    });
    steps.push({
      name: "submit-player1-clue",
      status: clueResponse.status,
      ok: clueResponse.ok,
      body: await readJsonSafe(clueResponse),
    });

    if (cleanup) {
      const cleanupResponse = await fetch(`${origin}/api/debug/room/${roomCode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete-room",
        }),
        cache: "no-store",
      });
      steps.push({
        name: "cleanup-room",
        status: cleanupResponse.status,
        ok: cleanupResponse.ok,
        body: await readJsonSafe(cleanupResponse),
      });
    }

    return NextResponse.json({
      requestId,
      ok: steps.every((step) =>
        step.name === "reject-wrong-turn-update" ? !step.ok : step.ok,
      ),
      roomCode,
      cleanup,
      steps,
    });
  } catch (error) {
    return NextResponse.json(
      {
        requestId,
        ok: false,
        roomCode,
        error: error instanceof Error ? error.message : "Network smoke test failed.",
        steps,
      },
      { status: 500 },
    );
  }
}
