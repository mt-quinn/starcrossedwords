import { saveGeneratedPuzzle } from "@/lib/crossword/generated-puzzles";
import { generateCrossword } from "@/lib/crossword/solver";

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseStringArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

async function main() {
  const templateId = parseStringArg("templateId", "15x15-classic-template-01");
  const targetCount = parseNumberArg("count", 10);
  const timeLimitMs = parseNumberArg("timeLimitMs", 8000);
  const maxAttempts = parseNumberArg("maxAttempts", targetCount * 4);
  const seedBase = parseNumberArg("seedBase", Date.now());

  const usageByAnswer = new Map<string, number>();
  const corpusStats = {
    totalEntries: 0,
    shortDuplicateEntries: 0,
  };
  const repeatedAnswerCounts = new Map<string, number>();
  const acceptedFiles: string[] = [];
  const failures: Array<{ attempt: number; error: string }> = [];
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts && acceptedFiles.length < targetCount; attempt += 1) {
    try {
      const generated = await generateCrossword({
        templateId,
        timeLimitMs,
        usageByAnswer,
        corpusStats,
        randomSeed: seedBase + attempt,
      });

      generated.fileName = `${generated.generatedAt.replace(/[:.]/g, "-")}-template-batch-${String(
        acceptedFiles.length + 1,
      ).padStart(3, "0")}.json`;
      const fileName = await saveGeneratedPuzzle(generated);
      acceptedFiles.push(fileName);

      for (const entry of generated.puzzle.entries) {
        const usageCount = usageByAnswer.get(entry.answer) ?? 0;

        if (usageCount > 0 && entry.answer.length <= 6) {
          corpusStats.shortDuplicateEntries += 1;
          repeatedAnswerCounts.set(entry.answer, usageCount + 1);
        }

        usageByAnswer.set(entry.answer, usageCount + 1);
        corpusStats.totalEntries += 1;
      }

      process.stdout.write(
        `accepted ${acceptedFiles.length}/${targetCount} in attempt ${attempt}: ${fileName} · ${generated.solver.durationMs}ms · reused=${Math.round((generated.analytics?.diversity.duplicateEntryRate ?? 0) * 100)}% · avgScore=${generated.analytics?.quality.averageScore.toFixed(1) ?? "0.0"}\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      failures.push({ attempt, error: message });
      process.stdout.write(`skipped attempt ${attempt}: ${message}\n`);
    }
  }

  const repeatedAnswers = Array.from(repeatedAnswerCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 25)
    .map(([answer, count]) => ({ answer, count }));

  process.stdout.write(
    `${JSON.stringify(
      {
        templateId,
        targetCount,
        acceptedCount: acceptedFiles.length,
        maxAttempts,
        elapsedMs: Date.now() - startedAt,
        corpusStats: {
          ...corpusStats,
          shortDuplicateRate: corpusStats.totalEntries
            ? corpusStats.shortDuplicateEntries / corpusStats.totalEntries
            : 0,
          uniqueAnswerCount: usageByAnswer.size,
        },
        acceptedFiles,
        failures,
        repeatedAnswers,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
