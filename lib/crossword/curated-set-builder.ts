import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCrossword } from "@/lib/crossword/solver";
import { buildTemplateModel } from "@/lib/crossword/templates";
import type { CuratedGeneratedPuzzleIndex } from "@/lib/crossword/curated-puzzles";
import type { GeneratedPuzzleRecord, GridTemplate } from "@/lib/crossword/types";
import { parsePuz } from "@/lib/puz";
import { getPuzzlePathFromId } from "@/lib/puzzle-library";

const GRID_TEMPLATE_DIR = path.join(process.cwd(), "data", "grid-templates");
const CURATED_GENERATED_PUZZLE_DIR = path.join(process.cwd(), "data", "generated-puzzles");
const CURATED_GENERATED_PUZZLE_INDEX_PATH = path.join(CURATED_GENERATED_PUZZLE_DIR, "index.json");

const CURATED_SOURCE_PUZZLE_IDS = [
  "NY Times - 20100104.puz",
  "NY Times - 20100105.puz",
  "NY Times - 20100106.puz",
  "NY Times - 20100107.puz",
  "NY Times - 20100108.puz",
  "NY Times - 20100111.puz",
  "NY Times - 20100112.puz",
  "NY Times - 20100113.puz",
  "NY Times - 20100114.puz",
  "NY Times - 20100115.puz",
  "NY Times - 20100118.puz",
  "NY Times - 20100119.puz",
  "NY Times - 20100120.puz",
  "NY Times - 20100121.puz",
  "NY Times - 20100122.puz",
  "NY Times - 20100125.puz",
  "NY Times - 20100126.puz",
  "NY Times - 20100127.puz",
  "NY Times - 20100128.puz",
  "NY Times - 20100129.puz",
] as const;

export interface CuratedSetBuildOptions {
  logger?: (message: string) => void;
  targetCount?: number;
  sourcePuzzleIds?: readonly string[];
  timeLimitMs?: number;
}

function buildTemplateId(number: number): string {
  return `generated-online-${String(number).padStart(2, "0")}`;
}

function buildPuzzleFileName(number: number): string {
  return `puzzle-${String(number).padStart(2, "0")}.json`;
}

async function writeJsonFile(targetPath: string, data: unknown) {
  await writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function buildTemplateFromSource(sourcePuzzleId: string, number: number): Promise<GridTemplate> {
  const buffer = await readFile(getPuzzlePathFromId(sourcePuzzleId));
  const puzzle = parsePuz(buffer);

  if (puzzle.width !== 15 || puzzle.height !== 15) {
    throw new Error(`Expected a 15x15 puzzle for template ${number}, got ${puzzle.width}x${puzzle.height}.`);
  }

  return {
    id: buildTemplateId(number),
    title: `Generated Online Template ${number}`,
    width: puzzle.width,
    height: puzzle.height,
    sourcePuzzleId,
    rows: Array.from({ length: puzzle.height }, (_, rowIndex) =>
      Array.from({ length: puzzle.width }, (_, colIndex) => {
        const cell = puzzle.cells[rowIndex * puzzle.width + colIndex];
        return cell.isBlock ? "#" : ".";
      }).join(""),
    ),
  };
}

export async function buildCuratedGeneratedPuzzleSet(
  options?: CuratedSetBuildOptions,
): Promise<CuratedGeneratedPuzzleIndex> {
  const logger = options?.logger ?? (() => {});
  const targetCount = options?.targetCount ?? 5;
  const sourcePuzzleIds = options?.sourcePuzzleIds ?? CURATED_SOURCE_PUZZLE_IDS;
  const timeLimitMs = options?.timeLimitMs ?? 10000;

  await mkdir(GRID_TEMPLATE_DIR, { recursive: true });
  await mkdir(CURATED_GENERATED_PUZZLE_DIR, { recursive: true });

  for (const name of await readdir(GRID_TEMPLATE_DIR)) {
    if (name.startsWith("generated-online-") && name.endsWith(".json")) {
      await rm(path.join(GRID_TEMPLATE_DIR, name), { force: true });
    }
  }

  await rm(CURATED_GENERATED_PUZZLE_DIR, { recursive: true, force: true });
  await mkdir(CURATED_GENERATED_PUZZLE_DIR, { recursive: true });

  const excludeNormalized = new Set<string>();
  const curatedTemplates: GridTemplate[] = [];
  const generatedRecords: GeneratedPuzzleRecord[] = [];
  const indexEntries: CuratedGeneratedPuzzleIndex["puzzles"] = [];
  let generatedCount = 0;

  logger(
    `Starting curated set build: target=${targetCount}, sources=${sourcePuzzleIds.length}, timeLimitMs=${timeLimitMs}`,
  );

  for (const sourcePuzzleId of sourcePuzzleIds) {
    if (generatedCount >= targetCount) {
      break;
    }

    const number = generatedCount + 1;
    const template = await buildTemplateFromSource(sourcePuzzleId, number);
    const model = buildTemplateModel(template);
    const startedAt = Date.now();

    logger(
      `Trying puzzle ${number} from ${sourcePuzzleId} with ${excludeNormalized.size} excluded answers`,
    );

    try {
      const generatedRecord = await generateCrossword({
        templateId: template.id,
        model,
        excludeNormalized,
        fileName: buildPuzzleFileName(number),
        timeLimitMs,
      });

      indexEntries.push({
        number,
        fileName: generatedRecord.fileName,
        templateId: template.id,
        sourcePuzzleId,
      });

      for (const entry of generatedRecord.puzzle.entries) {
        excludeNormalized.add(entry.answer);
      }

      curatedTemplates.push(template);
      generatedRecords.push(generatedRecord);
      generatedCount += 1;
      logger(
        `Accepted puzzle ${number} from ${sourcePuzzleId} in ${Date.now() - startedAt}ms using ${generatedRecord.solver.maxTierUsed}`,
      );
    } catch (error) {
      logger(
        `Skipped ${sourcePuzzleId} after ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      continue;
    }
  }

  if (generatedCount < targetCount) {
    throw new Error(`Only generated ${generatedCount} curated puzzles out of ${targetCount} requested.`);
  }

  const indexData: CuratedGeneratedPuzzleIndex = {
    generatedAt: new Date().toISOString(),
    puzzles: indexEntries,
  };

  for (const template of curatedTemplates) {
    await writeJsonFile(path.join(GRID_TEMPLATE_DIR, `${template.id}.json`), template);
  }

  for (const record of generatedRecords) {
    await writeJsonFile(path.join(CURATED_GENERATED_PUZZLE_DIR, record.fileName), record);
  }

  await writeJsonFile(CURATED_GENERATED_PUZZLE_INDEX_PATH, indexData);
  logger(`Finished curated set build with ${generatedCount} puzzles`);
  return indexData;
}

export async function clearCuratedGeneratedPuzzleSet() {
  await rm(CURATED_GENERATED_PUZZLE_DIR, { recursive: true, force: true });
}
