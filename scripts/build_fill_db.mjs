import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const sourcePath = path.join(
  workspaceRoot,
  "Scored Answer Database",
  "crossword-wordlist",
  "crossword_wordlist.txt",
);
const outputDir = path.join(workspaceRoot, "data", "crossword-fill");

const MIN_LENGTH = 3;
const MAX_LENGTH = 15;

const SCORE_TIERS = [
  { name: "preferred", minScore: 50, maxScore: Infinity },
  { name: "strong", minScore: 40, maxScore: 49 },
  { name: "acceptable", minScore: 25, maxScore: 39 },
  { name: "fallback", minScore: 10, maxScore: 24 },
  { name: "emergency", minScore: Number.NEGATIVE_INFINITY, maxScore: 9 },
];

function normalizeAnswer(answer) {
  return answer
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function scoreTier(score) {
  return SCORE_TIERS.find((tier) => score >= tier.minScore && score <= tier.maxScore)?.name ?? "emergency";
}

function compareCandidates(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.normalized !== right.normalized) {
    return left.normalized.localeCompare(right.normalized);
  }

  return left.preferredForm.localeCompare(right.preferredForm);
}

function createLengthBuckets() {
  return Object.fromEntries(
    Array.from({ length: MAX_LENGTH - MIN_LENGTH + 1 }, (_, offset) => {
      const length = MIN_LENGTH + offset;

      return [
        String(length),
        {
          preferred: [],
          strong: [],
          acceptable: [],
          fallback: [],
          emergency: [],
        },
      ];
    }),
  );
}

async function buildFillDb() {
  const rawInput = await readFile(sourcePath, "utf8");
  const lines = rawInput.split(/\r?\n/);

  const normalizedEntries = new Map();
  const stats = {
    sourceEntries: 0,
    malformedLines: 0,
    emptyNormalizedAnswers: 0,
    outOfRangeLength: 0,
    duplicateVariantsCollapsed: 0,
    duplicateNormalizedForms: 0,
  };

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const separatorIndex = line.lastIndexOf(";");

    if (separatorIndex === -1) {
      stats.malformedLines += 1;
      continue;
    }

    const rawAnswer = line.slice(0, separatorIndex).trim();
    const rawScore = line.slice(separatorIndex + 1).trim();
    const score = Number.parseInt(rawScore, 10);

    if (!rawAnswer || Number.isNaN(score)) {
      stats.malformedLines += 1;
      continue;
    }

    stats.sourceEntries += 1;

    const normalized = normalizeAnswer(rawAnswer);

    if (!normalized) {
      stats.emptyNormalizedAnswers += 1;
      continue;
    }

    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      stats.outOfRangeLength += 1;
      continue;
    }

    const existing = normalizedEntries.get(normalized);

    if (!existing) {
      normalizedEntries.set(normalized, {
        normalized,
        length: normalized.length,
        score,
        preferredForm: rawAnswer,
        variantCount: 1,
      });
      continue;
    }

    stats.duplicateNormalizedForms += 1;
    existing.variantCount += 1;

    if (score > existing.score || (score === existing.score && rawAnswer.localeCompare(existing.preferredForm) < 0)) {
      existing.score = score;
      existing.preferredForm = rawAnswer;
      stats.duplicateVariantsCollapsed += 1;
    }
  }

  const byLength = createLengthBuckets();

  for (const entry of normalizedEntries.values()) {
    byLength[String(entry.length)][scoreTier(entry.score)].push(entry);
  }

  for (const lengthBucket of Object.values(byLength)) {
    for (const tierName of Object.keys(lengthBucket)) {
      lengthBucket[tierName].sort(compareCandidates);
    }
  }

  const summaryByLength = Object.fromEntries(
    Object.entries(byLength).map(([length, buckets]) => [
      length,
      {
        total:
          buckets.preferred.length +
          buckets.strong.length +
          buckets.acceptable.length +
          buckets.fallback.length +
          buckets.emergency.length,
        preferred: buckets.preferred.length,
        strong: buckets.strong.length,
        acceptable: buckets.acceptable.length,
        fallback: buckets.fallback.length,
        emergency: buckets.emergency.length,
      },
    ]),
  );

  const fillDb = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(workspaceRoot, sourcePath),
    normalization: {
      minLength: MIN_LENGTH,
      maxLength: MAX_LENGTH,
      normalizedFormat: "A-Z only",
      tierThresholds: SCORE_TIERS.map(({ name, minScore, maxScore }) => ({
        name,
        minScore,
        maxScore: Number.isFinite(maxScore) ? maxScore : null,
      })),
    },
    stats: {
      ...stats,
      normalizedEntries: normalizedEntries.size,
    },
    byLength,
  };

  const summary = {
    version: fillDb.version,
    generatedAt: fillDb.generatedAt,
    sourcePath: fillDb.sourcePath,
    normalization: fillDb.normalization,
    stats: fillDb.stats,
    byLength: summaryByLength,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "fill-db.json"), `${JSON.stringify(fillDb, null, 2)}\n`);
  await writeFile(path.join(outputDir, "fill-db.summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outputDir: path.relative(workspaceRoot, outputDir),
        fillDb: "fill-db.json",
        summary: "fill-db.summary.json",
        stats: summary.stats,
      },
      null,
      2,
    ),
  );
}

buildFillDb().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
