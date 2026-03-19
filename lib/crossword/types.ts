import type { EntryDirection, ParsedPuzzle } from "@/lib/puz";

export const FILL_TIERS = [
  "preferred",
  "strong",
  "acceptable",
  "fallback",
  "emergency",
] as const;

export type FillTier = (typeof FILL_TIERS)[number];

export interface FillDbEntry {
  normalized: string;
  length: number;
  score: number;
  preferredForm: string;
  variantCount: number;
}

export type FillDbBuckets = Record<FillTier, FillDbEntry[]>;

export interface FillDb {
  version: number;
  generatedAt: string;
  sourcePath: string;
  normalization: {
    minLength: number;
    maxLength: number;
    normalizedFormat: string;
    tierThresholds: Array<{
      name: FillTier;
      minScore: number | null;
      maxScore: number | null;
    }>;
  };
  stats: Record<string, number>;
  byLength: Record<string, FillDbBuckets>;
}

export interface FillDbSummary {
  version: number;
  generatedAt: string;
  sourcePath: string;
  normalization: FillDb["normalization"];
  stats: FillDb["stats"];
  byLength: Record<
    string,
    Record<FillTier | "total", number>
  >;
}

export interface GridTemplate {
  id: string;
  title: string;
  width: number;
  height: number;
  rows: string[];
  sourcePuzzleId?: string;
}

export interface TemplateCrossing {
  cellIndex: number;
  otherSlotId: string;
  slotPosition: number;
  otherSlotPosition: number;
}

export interface TemplateSlot {
  id: string;
  number: number;
  direction: EntryDirection;
  row: number;
  col: number;
  length: number;
  cellIndices: number[];
  crossings: TemplateCrossing[];
}

export interface TemplateModel {
  template: GridTemplate;
  puzzle: ParsedPuzzle;
  slots: TemplateSlot[];
}

export interface SolverStats {
  nodesVisited: number;
  backtracks: number;
  maxTierUsed: FillTier;
  candidateWindow: number;
  durationMs: number;
}

export interface GeneratedPuzzleRecord {
  id: string;
  fileName: string;
  templateId: string;
  generatedAt: string;
  puzzle: ParsedPuzzle;
  solver: SolverStats;
}
