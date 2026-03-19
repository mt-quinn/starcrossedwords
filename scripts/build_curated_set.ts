import { buildCuratedGeneratedPuzzleSet } from "@/lib/crossword/curated-set-builder";

function parseNumberArg(name: string): number | undefined {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));

  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseListArg(name: string): string[] | undefined {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));

  if (!raw) {
    return undefined;
  }

  return raw
    .slice(prefix.length)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function main() {
  const targetCount = parseNumberArg("target");
  const timeLimitMs = parseNumberArg("timeLimitMs");
  const sourcePuzzleIds = parseListArg("sources");

  const index = await buildCuratedGeneratedPuzzleSet({
    targetCount,
    timeLimitMs,
    sourcePuzzleIds,
    logger: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: index.generatedAt,
        puzzles: index.puzzles,
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
