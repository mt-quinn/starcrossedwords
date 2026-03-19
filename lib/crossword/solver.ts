import { expandFillTiers, findFillCandidates, loadFillEntryIndex } from "@/lib/crossword/fill-db";
import { materializeFilledPuzzle, loadTemplateModel } from "@/lib/crossword/templates";
import type {
  FillDbEntry,
  FillTier,
  GeneratedPuzzleAnalytics,
  GenerationDiversityPolicy,
  GenerationDiversityStats,
  GenerationQualityStats,
  GeneratedPuzzleRecord,
  SolverStats,
  TemplateModel,
  TemplateSlot,
} from "@/lib/crossword/types";

const TIER_ATTEMPTS: FillTier[] = ["strong", "acceptable", "fallback", "emergency"];
const DEFAULT_TIME_LIMIT_MS = 15000;
const CANDIDATE_WINDOWS: Record<FillTier, number> = {
  preferred: 120,
  strong: 160,
  acceptable: 240,
  fallback: 320,
  emergency: 420,
};
const DEFAULT_DIVERSITY_POLICY: GenerationDiversityPolicy = {
  maxSharedEntryLength: 6,
  maxShortDuplicateRate: 0.25,
};

type SlotChoice = {
  slot: TemplateSlot;
  candidates: FillDbEntry[];
};

type CorpusStatsSnapshot = {
  totalEntries: number;
  shortDuplicateEntries: number;
};

type CandidateEvaluation = {
  entry: FillDbEntry;
  usageCount: number;
  rankingScore: number;
};

type RandomSource = () => number;

function createRandomSource(seed?: number): RandomSource {
  if (seed === undefined) {
    return Math.random;
  }

  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeUsageMap(
  source?: ReadonlyMap<string, number> | Record<string, number>,
): Map<string, number> {
  if (!source) {
    return new Map<string, number>();
  }

  if (source instanceof Map) {
    return new Map(
      Array.from(source.entries(), ([answer, count]) => [answer.trim().toUpperCase(), count]),
    );
  }

  return new Map(
    Object.entries(source).map(([answer, count]) => [answer.trim().toUpperCase(), count]),
  );
}

function tierForScore(score: number): FillTier {
  if (score >= 50) {
    return "preferred";
  }

  if (score >= 40) {
    return "strong";
  }

  if (score >= 25) {
    return "acceptable";
  }

  if (score >= 10) {
    return "fallback";
  }

  return "emergency";
}

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

function evaluateCandidate(
  entry: FillDbEntry,
  usageCount: number,
  corpusStats: CorpusStatsSnapshot,
  diversityPolicy: GenerationDiversityPolicy,
): CandidateEvaluation | null {
  const isShortEntry = entry.length <= diversityPolicy.maxSharedEntryLength;

  if (!isShortEntry && usageCount > 0) {
    return null;
  }

  let rankingScore = entry.score + Math.min(entry.length, 10) * 0.35;

  if (entry.length <= 4) {
    rankingScore -= Math.max(0, 50 - entry.score) * 1.35;
  } else if (entry.length <= diversityPolicy.maxSharedEntryLength) {
    rankingScore -= Math.max(0, 40 - entry.score) * 0.65;
  }

  if (usageCount > 0) {
    const projectedShortDuplicateEntries = corpusStats.shortDuplicateEntries + 1;
    const projectedDuplicateRate =
      projectedShortDuplicateEntries / Math.max(1, corpusStats.totalEntries + 1);
    const duplicatePenalty =
      12 + usageCount * (7 + Math.max(0, diversityPolicy.maxSharedEntryLength - entry.length));
    const ratePenalty =
      Math.max(0, projectedDuplicateRate - diversityPolicy.maxShortDuplicateRate) * 220;

    rankingScore -= duplicatePenalty + ratePenalty;
  }

  return {
    entry,
    usageCount,
    rankingScore,
  };
}

function buildCandidateOrder(
  candidates: FillDbEntry[],
  usageByAnswer: Map<string, number>,
  corpusStats: CorpusStatsSnapshot,
  diversityPolicy: GenerationDiversityPolicy,
  random: RandomSource,
): FillDbEntry[] {
  const evaluated = candidates
    .map((entry) =>
      evaluateCandidate(
        entry,
        usageByAnswer.get(entry.normalized) ?? 0,
        corpusStats,
        diversityPolicy,
      ),
    )
    .filter((entry): entry is CandidateEvaluation => Boolean(entry))
    .sort((left, right) => right.rankingScore - left.rankingScore);

  const remaining = evaluated.slice();
  const ordered: FillDbEntry[] = [];

  while (remaining.length) {
    const bandSize = Math.min(8, remaining.length);
    const band = remaining.slice(0, bandSize);
    const bestScore = band[0].rankingScore;
    const weights = band.map(({ rankingScore, usageCount }) => {
      const usageAdjustment = usageCount > 0 ? 0.85 : 1;
      return Math.max(0.05, Math.exp((rankingScore - bestScore) / 6) * usageAdjustment);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let target = random() * totalWeight;
    let selectedIndex = 0;

    for (let index = 0; index < weights.length; index += 1) {
      target -= weights[index];

      if (target <= 0) {
        selectedIndex = index;
        break;
      }
    }

    ordered.push(band[selectedIndex].entry);
    remaining.splice(selectedIndex, 1);
  }

  return ordered;
}

async function buildPuzzleAnalytics(
  answers: string[],
  usageByAnswer: Map<string, number>,
  diversityPolicy: GenerationDiversityPolicy,
): Promise<GeneratedPuzzleAnalytics> {
  const fillEntryIndex = await loadFillEntryIndex();
  const tierCounts: Record<FillTier, number> = {
    preferred: 0,
    strong: 0,
    acceptable: 0,
    fallback: 0,
    emergency: 0,
  };
  let scoreTotal = 0;
  let minScore = Number.POSITIVE_INFINITY;
  let maxScore = Number.NEGATIVE_INFINITY;
  let duplicateEntries = 0;
  let shortDuplicateEntries = 0;
  let longDuplicateEntries = 0;

  for (const answer of answers) {
    const usageCount = usageByAnswer.get(answer) ?? 0;

    if (usageCount > 0) {
      duplicateEntries += 1;

      if (answer.length <= diversityPolicy.maxSharedEntryLength) {
        shortDuplicateEntries += 1;
      } else {
        longDuplicateEntries += 1;
      }
    }

    const score = fillEntryIndex.get(answer)?.score ?? 0;
    const tier = tierForScore(score);

    tierCounts[tier] += 1;
    scoreTotal += score;
    minScore = Math.min(minScore, score);
    maxScore = Math.max(maxScore, score);
  }

  const totalEntries = answers.length;
  const diversity: GenerationDiversityStats = {
    totalEntries,
    uniqueEntries: totalEntries - duplicateEntries,
    duplicateEntries,
    duplicateEntryRate: totalEntries ? duplicateEntries / totalEntries : 0,
    shortDuplicateEntries,
    shortDuplicateRate: totalEntries ? shortDuplicateEntries / totalEntries : 0,
    longDuplicateEntries,
  };
  const quality: GenerationQualityStats = {
    averageScore: totalEntries ? scoreTotal / totalEntries : 0,
    minScore: Number.isFinite(minScore) ? minScore : 0,
    maxScore: Number.isFinite(maxScore) ? maxScore : 0,
    tierCounts,
  };

  return { diversity, quality };
}

async function chooseNextSlot(
  model: TemplateModel,
  assignments: Map<string, string>,
  maxTier: FillTier,
  candidateWindow: number,
  excludeNormalized: Set<string>,
  usageByAnswer: Map<string, number>,
  corpusStats: CorpusStatsSnapshot,
  diversityPolicy: GenerationDiversityPolicy,
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
    ).filter(
      (entry) =>
        evaluateCandidate(
          entry,
          usageByAnswer.get(entry.normalized) ?? 0,
          corpusStats,
          diversityPolicy,
        ) !== null,
    );

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
  usageByAnswer: Map<string, number>,
  corpusStats: CorpusStatsSnapshot,
  diversityPolicy: GenerationDiversityPolicy,
  random: RandomSource,
): Promise<{
  answersBySlotId: Record<string, string>;
  stats: Omit<SolverStats, "durationMs">;
} | null> {
  const candidateWindow = CANDIDATE_WINDOWS[maxTier];
  const assignments = new Map<string, string>();
  let nodesVisited = 0;
  let backtracks = 0;
  let peakDepth = 0;

  const totalSlots = model.slots.length;
  const startedAt = Date.now();
  const totalBudgetMs = deadlineAt - startedAt;
  const progressGates: Array<{ at: number; minDepth: number }> = [
    { at: startedAt + totalBudgetMs * 0.20, minDepth: Math.ceil(totalSlots * 0.30) },
    { at: startedAt + totalBudgetMs * 0.45, minDepth: Math.ceil(totalSlots * 0.60) },
    { at: startedAt + totalBudgetMs * 0.70, minDepth: Math.ceil(totalSlots * 0.85) },
  ];
  let nextGateIndex = 0;

  async function search(): Promise<boolean> {
    const now = Date.now();

    if (now > deadlineAt) {
      return false;
    }

    if (nextGateIndex < progressGates.length && now > progressGates[nextGateIndex].at) {
      if (peakDepth < progressGates[nextGateIndex].minDepth) {
        return false;
      }
      nextGateIndex += 1;
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
      usageByAnswer,
      corpusStats,
      diversityPolicy,
    );

    if (!choice) {
      return true;
    }

    if (!choice.candidates.length) {
      backtracks += 1;
      return false;
    }

    nodesVisited += 1;

    for (const candidate of buildCandidateOrder(
      choice.candidates,
      usageByAnswer,
      corpusStats,
      diversityPolicy,
      random,
    )) {
      assignments.set(choice.slot.id, candidate.normalized);

      if (assignments.size > peakDepth) {
        peakDepth = assignments.size;
      }

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
  usageByAnswer?: ReadonlyMap<string, number> | Record<string, number>;
  corpusStats?: Partial<CorpusStatsSnapshot>;
  diversityPolicy?: Partial<GenerationDiversityPolicy>;
  randomSeed?: number;
}): Promise<GeneratedPuzzleRecord> {
  const model =
    options?.model ?? (await loadTemplateModel(options?.templateId ?? "15x15-classic-template-01"));
  const templateId = options?.templateId ?? model.template.id;
  const startedAt = Date.now();
  const deadlineAt = startedAt + (options?.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS);
  const excludeNormalized = new Set(
    Array.from(options?.excludeNormalized ?? []).map((entry) => entry.trim().toUpperCase()),
  );
  const usageByAnswer = normalizeUsageMap(options?.usageByAnswer);
  const diversityPolicy: GenerationDiversityPolicy = {
    ...DEFAULT_DIVERSITY_POLICY,
    ...options?.diversityPolicy,
  };
  const corpusStats: CorpusStatsSnapshot = {
    totalEntries: options?.corpusStats?.totalEntries ?? 0,
    shortDuplicateEntries: options?.corpusStats?.shortDuplicateEntries ?? 0,
  };
  const random = createRandomSource(options?.randomSeed);

  for (const maxTier of TIER_ATTEMPTS) {
    const solved = await solveTemplate(
      model,
      maxTier,
      deadlineAt,
      excludeNormalized,
      usageByAnswer,
      corpusStats,
      diversityPolicy,
      random,
    );

    if (!solved) {
      if (Date.now() > deadlineAt) {
        break;
      }

      continue;
    }

    const generatedAt = new Date().toISOString();
    const fileName = options?.fileName ?? `${generatedAt.replace(/[:.]/g, "-")}-${templateId}.json`;
    const analytics = await buildPuzzleAnalytics(
      Object.values(solved.answersBySlotId),
      usageByAnswer,
      diversityPolicy,
    );

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
      analytics,
    };
  }

  throw new Error("Could not generate a crossword with the current template and fill tiers.");
}
