import { open, readdir } from "node:fs/promises";
import path from "node:path";

const PUZZLE_DATABASE_DIR = path.join(process.cwd(), "Puzzle Database");
let cachedPuzzleIds: Promise<string[]> | null = null;
const standardPuzzleCache = new Map<string, Promise<boolean>>();

async function isFifteenByFifteen(filePath: string): Promise<boolean> {
  const handle = await open(filePath, "r");
  const header = Buffer.alloc(0x30);

  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }

  return header[0x2c] === 15 && header[0x2d] === 15;
}

async function listPuzzleIds(): Promise<string[]> {
  if (!cachedPuzzleIds) {
    cachedPuzzleIds = readdir(PUZZLE_DATABASE_DIR)
      .then((names) => names.filter((name) => name.endsWith(".puz")).sort())
      .catch(() => []);
  }

  return cachedPuzzleIds;
}

export async function listStandardPuzzleIds(): Promise<string[]> {
  const puzzleIds = await listPuzzleIds();
  const standardPuzzleIds: string[] = [];

  for (const puzzleId of puzzleIds) {
    if (await isStandardPuzzleId(puzzleId)) {
      standardPuzzleIds.push(puzzleId);
    }
  }

  return standardPuzzleIds;
}

async function isStandardPuzzleId(puzzleId: string): Promise<boolean> {
  const safeId = path.basename(puzzleId);
  let cachedResult = standardPuzzleCache.get(safeId);

  if (!cachedResult) {
    cachedResult = isFifteenByFifteen(path.join(PUZZLE_DATABASE_DIR, safeId));
    standardPuzzleCache.set(safeId, cachedResult);
  }

  return cachedResult;
}

export function getPuzzlePathFromId(puzzleId: string): string {
  const safeId = path.basename(puzzleId);
  return path.join(PUZZLE_DATABASE_DIR, safeId);
}

export async function getRandomPuzzleId(excludeId?: string): Promise<string> {
  const puzzleIds = await listPuzzleIds();
  const pool = excludeId ? puzzleIds.filter((puzzleId) => puzzleId !== excludeId) : puzzleIds;

  if (!pool.length) {
    throw new Error("No `.puz` files were found in the puzzle database.");
  }

  const startIndex = Math.floor(Math.random() * pool.length);

  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(startIndex + offset) % pool.length];

    if (await isStandardPuzzleId(candidate)) {
      return candidate;
    }
  }

  throw new Error("No 15x15 `.puz` files were found in the puzzle database.");
}
