import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GeneratedPuzzleRecord } from "@/lib/crossword/types";

const GENERATED_PUZZLE_DIR = path.join(process.cwd(), "Generated Puzzle Database");

export async function ensureGeneratedPuzzleDir() {
  await mkdir(GENERATED_PUZZLE_DIR, { recursive: true });
}

export async function saveGeneratedPuzzle(record: GeneratedPuzzleRecord): Promise<string> {
  await ensureGeneratedPuzzleDir();
  const fileName = path.basename(record.fileName);
  const targetPath = path.join(GENERATED_PUZZLE_DIR, fileName);
  await writeFile(targetPath, `${JSON.stringify(record, null, 2)}\n`);
  return fileName;
}

export async function listGeneratedPuzzleFiles(): Promise<string[]> {
  await ensureGeneratedPuzzleDir();
  const names = await readdir(GENERATED_PUZZLE_DIR);
  return names.filter((name) => name.endsWith(".json")).sort().reverse();
}

export async function readGeneratedPuzzle(fileName: string): Promise<GeneratedPuzzleRecord | null> {
  await ensureGeneratedPuzzleDir();
  const safeFileName = path.basename(fileName);

  try {
    const content = await readFile(path.join(GENERATED_PUZZLE_DIR, safeFileName), "utf8");
    return JSON.parse(content) as GeneratedPuzzleRecord;
  } catch {
    return null;
  }
}
