import { readFile } from "node:fs/promises";
import path from "node:path";

import type { GeneratedPuzzleRecord } from "@/lib/crossword/types";
import type { ParsedPuzzle } from "@/lib/puz";

const CURATED_GENERATED_PUZZLE_DIR = path.join(process.cwd(), "data", "generated-puzzles");
const CURATED_GENERATED_PUZZLE_INDEX_PATH = path.join(CURATED_GENERATED_PUZZLE_DIR, "index.json");

export interface CuratedGeneratedPuzzleIndexEntry {
  number: number;
  fileName: string;
  templateId: string;
}

export interface CuratedGeneratedPuzzleIndex {
  generatedAt: string;
  puzzles: CuratedGeneratedPuzzleIndexEntry[];
}

let curatedIndexPromise: Promise<CuratedGeneratedPuzzleIndex> | null = null;
const curatedPuzzlePromiseCache = new Map<number, Promise<GeneratedPuzzleRecord>>();

export async function loadCuratedGeneratedPuzzleIndex(): Promise<CuratedGeneratedPuzzleIndex> {
  if (!curatedIndexPromise) {
    curatedIndexPromise = readFile(CURATED_GENERATED_PUZZLE_INDEX_PATH, "utf8").then(
      (content) => JSON.parse(content) as CuratedGeneratedPuzzleIndex,
    );
  }

  return curatedIndexPromise;
}

export async function listCuratedGeneratedPuzzleNumbers(): Promise<number[]> {
  const index = await loadCuratedGeneratedPuzzleIndex();
  return index.puzzles.map((entry) => entry.number);
}

export async function loadCuratedGeneratedPuzzle(number: number): Promise<GeneratedPuzzleRecord> {
  let cachedPuzzle = curatedPuzzlePromiseCache.get(number);

  if (!cachedPuzzle) {
    cachedPuzzle = loadCuratedGeneratedPuzzleIndex().then(async (index) => {
      const match = index.puzzles.find((entry) => entry.number === number);

      if (!match) {
        throw new Error(`Unknown curated generated puzzle number: ${number}`);
      }

      const content = await readFile(path.join(CURATED_GENERATED_PUZZLE_DIR, match.fileName), "utf8");
      return JSON.parse(content) as GeneratedPuzzleRecord;
    });
    curatedPuzzlePromiseCache.set(number, cachedPuzzle);
  }

  return cachedPuzzle;
}

export async function loadCuratedGeneratedPuzzleBySelection(selection: string): Promise<ParsedPuzzle> {
  const puzzleNumber = Number.parseInt(selection, 10);

  if (!Number.isInteger(puzzleNumber)) {
    throw new Error(`Invalid generated puzzle selection: ${selection}`);
  }

  return (await loadCuratedGeneratedPuzzle(puzzleNumber)).puzzle;
}

export async function getRandomCuratedGeneratedPuzzleSelection(): Promise<string> {
  const numbers = await listCuratedGeneratedPuzzleNumbers();

  if (!numbers.length) {
    throw new Error("No curated generated puzzles are available.");
  }

  return String(numbers[Math.floor(Math.random() * numbers.length)]);
}
