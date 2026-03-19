import {
  expandFillTiers,
  findFillCandidates,
} from "@/lib/crossword/fill-db";
import { materializeFilledPuzzle, loadTemplateModel } from "@/lib/crossword/templates";
import type {
  FillTier,
  GeneratedPuzzleRecord,
  SolverStats,
  TemplateModel,
  TemplateSlot,
} from "@/lib/crossword/types";

const TIER_ATTEMPTS: FillTier[] = ["preferred", "strong", "acceptable", "fallback", "emergency"];
const DEFAULT_TIME_LIMIT_MS = 15000;
const CANDIDATE_WINDOWS: Record<FillTier, number> = {
  preferred: 80,
  strong: 120,
  acceptable: 180,
  fallback: 260,
  emergency: 320,
};

type SlotChoice = {
  slot: TemplateSlot;
  candidates: string[];
};

function buildPatternForSlot(
  slot: TemplateSlot,
  assignments: Map<string, string>,
): string {
  const pattern = Array.from({ length: slot.length }, () => ".");

  for (const crossing of slot.crossings) {
    const otherAnswer = assignments.get(crossing.otherSlotId);

    if (!otherAnswer) {
      continue;
    }

    pattern[crossing.slotPosition] = otherAnswer[crossing.otherSlotPosition];
  }

  return pattern.join("");
}

function scoreSlotPriority(slot: TemplateSlot) {
  return slot.crossings.length * 100 + slot.length;
}

async function chooseNextSlot(
  model: TemplateModel,
  assignments: Map<string, string>,
  maxTier: FillTier,
  candidateWindow: number,
  excludeNormalized: Set<string>,
): Promise<SlotChoice | null> {
  const tiers = expandFillTiers(maxTier);
  const usedAnswers = new Set([...excludeNormalized, ...assignments.values()]);
  let bestChoice: SlotChoice | null = null;

  for (const slot of model.slots) {
    if (assignments.has(slot.id)) {
      continue;
    }

    const candidates = (
      await findFillCandidates({
        length: slot.length,
        pattern: buildPatternForSlot(slot, assignments),
        tiers,
        excludeNormalized: usedAnswers,
        limit: candidateWindow,
      })
    ).map((entry) => entry.normalized);

    if (!candidates.length) {
      return {
        slot,
        candidates: [],
      };
    }

    if (
      !bestChoice ||
      candidates.length < bestChoice.candidates.length ||
      (candidates.length === bestChoice.candidates.length &&
        scoreSlotPriority(slot) > scoreSlotPriority(bestChoice.slot))
    ) {
      bestChoice = {
        slot,
        candidates,
      };
    }
  }

  return bestChoice;
}

async function solveTemplate(
  model: TemplateModel,
  maxTier: FillTier,
  deadlineAt: number,
  excludeNormalized: Set<string>,
): Promise<{
  answersBySlotId: Record<string, string>;
  stats: Omit<SolverStats, "durationMs">;
} | null> {
  const candidateWindow = CANDIDATE_WINDOWS[maxTier];
  const assignments = new Map<string, string>();
  let nodesVisited = 0;
  let backtracks = 0;

  async function search(): Promise<boolean> {
    if (Date.now() > deadlineAt) {
      return false;
    }

    if (assignments.size === model.slots.length) {
      return true;
    }

    const choice = await chooseNextSlot(
      model,
      assignments,
      maxTier,
      candidateWindow,
      excludeNormalized,
    );

    if (!choice) {
      return true;
    }

    if (!choice.candidates.length) {
      backtracks += 1;
      return false;
    }

    nodesVisited += 1;

    for (const candidate of choice.candidates) {
      assignments.set(choice.slot.id, candidate);

      if (await search()) {
        return true;
      }

      assignments.delete(choice.slot.id);
    }

    backtracks += 1;
    return false;
  }

  const solved = await search();

  if (!solved) {
    return null;
  }

  return {
    answersBySlotId: Object.fromEntries(assignments),
    stats: {
      nodesVisited,
      backtracks,
      maxTierUsed: maxTier,
      candidateWindow,
    },
  };
}

export async function generateCrossword(options?: {
  templateId?: string;
  model?: TemplateModel;
  timeLimitMs?: number;
  excludeNormalized?: Iterable<string>;
  fileName?: string;
}): Promise<GeneratedPuzzleRecord> {
  const model = options?.model ?? (await loadTemplateModel(options?.templateId ?? "15x15-classic-nyt-20100104"));
  const templateId = options?.templateId ?? model.template.id;
  const startedAt = Date.now();
  const deadlineAt = startedAt + (options?.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS);
  const excludeNormalized = new Set(
    Array.from(options?.excludeNormalized ?? []).map((entry) => entry.trim().toUpperCase()),
  );

  for (const maxTier of TIER_ATTEMPTS) {
    const solved = await solveTemplate(model, maxTier, deadlineAt, excludeNormalized);

    if (!solved) {
      if (Date.now() > deadlineAt) {
        break;
      }

      continue;
    }

    const generatedAt = new Date().toISOString();
    const fileName = options?.fileName ?? `${generatedAt.replace(/[:.]/g, "-")}-${templateId}.json`;

    return {
      id: crypto.randomUUID(),
      fileName,
      templateId,
      generatedAt,
      puzzle: materializeFilledPuzzle(model, solved.answersBySlotId),
      solver: {
        ...solved.stats,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  throw new Error("Could not generate a crossword with the current template and fill tiers.");
}
