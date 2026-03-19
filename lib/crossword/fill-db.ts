import { readFile } from "node:fs/promises";
import path from "node:path";

import type { FillDb, FillDbEntry, FillDbSummary, FillTier } from "@/lib/crossword/types";
import { FILL_TIERS } from "@/lib/crossword/types";

const FILL_DB_PATH = path.join(process.cwd(), "data", "crossword-fill", "fill-db.json");
const FILL_DB_SUMMARY_PATH = path.join(process.cwd(), "data", "crossword-fill", "fill-db.summary.json");

let fillDbPromise: Promise<FillDb> | null = null;
let fillDbSummaryPromise: Promise<FillDbSummary> | null = null;

function normalizePattern(pattern: string): string {
  return pattern
    .trim()
    .toUpperCase()
    .replace(/[^A-Z?.]/g, "")
    .replace(/\?/g, ".");
}

function assertValidLength(length: number) {
  if (!Number.isInteger(length) || length < 3 || length > 15) {
    throw new Error("Fill database only supports answer lengths 3 through 15.");
  }
}

function assertValidTier(tier: FillTier) {
  if (!FILL_TIERS.includes(tier)) {
    throw new Error(`Unknown fill tier: ${tier}`);
  }
}

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T;
}

export async function loadFillDb(): Promise<FillDb> {
  if (!fillDbPromise) {
    fillDbPromise = readJsonFile<FillDb>(FILL_DB_PATH);
  }

  return fillDbPromise;
}

export async function loadFillDbSummary(): Promise<FillDbSummary> {
  if (!fillDbSummaryPromise) {
    fillDbSummaryPromise = readJsonFile<FillDbSummary>(FILL_DB_SUMMARY_PATH);
  }

  return fillDbSummaryPromise;
}

export function expandFillTiers(maxTier: FillTier): FillTier[] {
  assertValidTier(maxTier);
  return FILL_TIERS.slice(0, FILL_TIERS.indexOf(maxTier) + 1);
}

export async function getFillEntriesByLength(
  length: number,
  tiers: FillTier[] = FILL_TIERS.slice(),
): Promise<FillDbEntry[]> {
  assertValidLength(length);
  const fillDb = await loadFillDb();
  const buckets = fillDb.byLength[String(length)];

  if (!buckets) {
    return [];
  }

  return tiers.flatMap((tier) => {
    assertValidTier(tier);
    return buckets[tier] ?? [];
  });
}

export async function findFillCandidates(options: {
  length: number;
  pattern?: string;
  tiers?: FillTier[];
  limit?: number;
  excludeNormalized?: Iterable<string>;
}): Promise<FillDbEntry[]> {
  const { length, limit } = options;
  const tiers = options.tiers ?? FILL_TIERS.slice();
  const rawPattern = options.pattern ? normalizePattern(options.pattern) : null;

  assertValidLength(length);

  if (rawPattern && rawPattern.length !== length) {
    throw new Error("Pattern length must match requested answer length.");
  }

  const exclude = new Set(
    Array.from(options.excludeNormalized ?? []).map((entry) => entry.trim().toUpperCase()),
  );
  const candidates = await getFillEntriesByLength(length, tiers);

  return candidates.filter((entry) => {
    if (exclude.has(entry.normalized)) {
      return false;
    }

    if (!rawPattern) {
      return true;
    }

    for (let index = 0; index < rawPattern.length; index += 1) {
      const patternChar = rawPattern[index];

      if (patternChar !== "." && entry.normalized[index] !== patternChar) {
        return false;
      }
    }

    return true;
  }).slice(0, limit ?? Number.POSITIVE_INFINITY);
}
