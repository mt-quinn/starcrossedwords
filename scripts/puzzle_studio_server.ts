import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTemplateModel } from "@/lib/crossword/templates";
import {
  buildTemplateFromPuzzleId,
  listSourceTemplatePuzzleIds,
} from "@/lib/crossword/source-templates";
import { generateCrossword } from "@/lib/crossword/solver";
import { listGridTemplateIds } from "@/lib/crossword/templates";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const viewerRoot = path.join(workspaceRoot, "Puzzle Viewer");
const port = Number.parseInt(process.env.PUZZLE_STUDIO_PORT ?? "4312", 10);

function sendJson(response: import("node:http").ServerResponse, statusCode: number, value: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildFileName(runLabel: string, acceptedCount: number, generatedAt: string) {
  return `${generatedAt.replace(/[:.]/g, "-")}-${runLabel}-${String(acceptedCount).padStart(3, "0")}.json`;
}

function createRandomSource(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], seed: number) {
  const random = createRandomSource(seed);

  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStaticFile(response: import("node:http").ServerResponse, filePath: string) {
  const content = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".js"
        ? "text/javascript; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  response.end(content);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/templates") {
      const templateIds = await listGridTemplateIds();
      const sourceTemplateCount = (await listSourceTemplatePuzzleIds()).length;
      sendJson(response, 200, { templateIds, sourceTemplateCount });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/generate-stream") {
      const body = (await readBody(request)) as {
        mode?: string;
        templateId?: string;
        count?: number;
        maxAttempts?: number;
        timeLimitMs?: number;
        seedBase?: number;
        stallLimit?: number;
      };

      const mode = body.mode === "source-sweep" ? "source-sweep" : "template-batch";
      const templateId = typeof body.templateId === "string" ? body.templateId : "15x15-classic-template-01";
      const requestedCount = parseNumber(body.count, 10);
      const targetCount = mode === "source-sweep" && requestedCount <= 0 ? 0 : Math.max(1, requestedCount);
      const maxAttempts = Math.max(targetCount || 1, parseNumber(body.maxAttempts, (targetCount || 10) * 4));
      const timeLimitMs = Math.max(1000, parseNumber(body.timeLimitMs, 8000));
      const seedBase = parseNumber(body.seedBase, Date.now());
      const stallLimit = Math.max(1, parseNumber(body.stallLimit, 20));
      const usageByAnswer = new Map<string, number>();
      const corpusStats = {
        totalEntries: 0,
        shortDuplicateEntries: 0,
      };
      const repeatedAnswerCounts = new Map<string, number>();
      const startedAt = Date.now();
      let acceptedCount = 0;
      let consecutiveFailures = 0;
      let closed = false;
      const sourcePuzzleIds =
        mode === "source-sweep" ? await listSourceTemplatePuzzleIds() : [];

      if (mode === "source-sweep") {
        shuffleInPlace(sourcePuzzleIds, seedBase);
      }

      request.on("close", () => {
        closed = true;
      });

      response.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const emit = (event: Record<string, unknown>) => {
        if (!closed) {
          response.write(`${JSON.stringify(event)}\n`);
        }
      };

      emit({
        type: "run-start",
        mode,
        templateId,
        targetCount,
        maxAttempts,
        timeLimitMs,
        seedBase,
        stallLimit,
        sourceTemplateCount: sourcePuzzleIds.length,
      });

      const attemptLimit = mode === "source-sweep" ? sourcePuzzleIds.length : maxAttempts;

      for (
        let attempt = 1;
        attempt <= attemptLimit &&
        (targetCount === 0 || acceptedCount < targetCount) &&
        !closed;
        attempt += 1
      ) {
        if (mode === "source-sweep" && consecutiveFailures >= stallLimit) {
          break;
        }

        const attemptStartedAt = Date.now();
        const sourcePuzzleId = mode === "source-sweep" ? sourcePuzzleIds[attempt - 1] : null;
        const activeTemplateId =
          mode === "source-sweep"
            ? `source-sweep-template-${String(attempt).padStart(4, "0")}`
            : templateId;

        let model: ReturnType<typeof buildTemplateModel> | undefined;
        let templateSlotCount = 0;
        let templateMinSlotLen = 0;
        let templateMaxSlotLen = 0;

        try {
          if (mode === "source-sweep" && sourcePuzzleId) {
            const rawTemplate = await buildTemplateFromPuzzleId(
              sourcePuzzleId,
              activeTemplateId,
              `Source Sweep Template ${attempt}`,
            );
            model = buildTemplateModel(rawTemplate);
          }
        } catch (validationError) {
          emit({
            type: "validation-skip",
            mode,
            attempt,
            acceptedCount,
            targetCount,
            elapsedMs: Date.now() - attemptStartedAt,
            error: validationError instanceof Error ? validationError.message : "unknown error",
            sourceOrdinal: mode === "source-sweep" ? attempt : null,
            sourceTemplateCount: mode === "source-sweep" ? sourcePuzzleIds.length : null,
          });
          continue;
        }

        if (model) {
          templateSlotCount = model.slots.length;
          const lengths = model.slots.map((slot) => slot.length);
          templateMinSlotLen = Math.min(...lengths);
          templateMaxSlotLen = Math.max(...lengths);
        }

        emit({
          type: "attempt-start",
          attempt,
          acceptedCount,
          targetCount,
          consecutiveFailures,
          sourceOrdinal: mode === "source-sweep" ? attempt : null,
          sourceTemplateCount: mode === "source-sweep" ? sourcePuzzleIds.length : null,
          templateSlotCount: templateSlotCount || null,
          templateSlotRange: templateSlotCount
            ? `${templateMinSlotLen}–${templateMaxSlotLen}`
            : null,
        });

        try {
          const generated = await generateCrossword({
            templateId: activeTemplateId,
            model,
            timeLimitMs,
            usageByAnswer,
            corpusStats,
            randomSeed: seedBase + attempt,
          });

          consecutiveFailures = 0;
          acceptedCount += 1;
          generated.fileName = buildFileName(
            mode === "source-sweep" ? "source-sweep" : "template-batch",
            acceptedCount,
            generated.generatedAt,
          );

          for (const entry of generated.puzzle.entries) {
            const usageCount = usageByAnswer.get(entry.answer) ?? 0;

            if (usageCount > 0 && entry.answer.length <= 6) {
              corpusStats.shortDuplicateEntries += 1;
              repeatedAnswerCounts.set(entry.answer, usageCount + 1);
            }

            usageByAnswer.set(entry.answer, usageCount + 1);
            corpusStats.totalEntries += 1;
          }

          emit({
            type: "generated",
            mode,
            attempt,
            acceptedCount,
            targetCount,
            elapsedMs: Date.now() - attemptStartedAt,
            fileName: generated.fileName,
            solver: generated.solver,
            analytics: generated.analytics,
            record: generated,
          });
        } catch (error) {
          consecutiveFailures += 1;
          emit({
            type: "skipped",
            mode,
            attempt,
            acceptedCount,
            targetCount,
            elapsedMs: Date.now() - attemptStartedAt,
            reason: "solver-timeout",
            error: error instanceof Error ? error.message : "unknown error",
            consecutiveFailures,
            sourceOrdinal: mode === "source-sweep" ? attempt : null,
            sourceTemplateCount: mode === "source-sweep" ? sourcePuzzleIds.length : null,
            templateSlotCount: templateSlotCount || null,
            templateSlotRange: templateSlotCount
              ? `${templateMinSlotLen}–${templateMaxSlotLen}`
              : null,
          });
        }
      }

      emit({
        type: "run-complete",
        mode,
        acceptedCount,
        targetCount,
        elapsedMs: Date.now() - startedAt,
        stopReason:
          mode === "source-sweep" && consecutiveFailures >= stallLimit
            ? "stall-limit"
            : mode === "source-sweep"
              ? "source-pool-exhausted"
              : acceptedCount >= targetCount
                ? "target-reached"
                : "attempt-limit",
        consecutiveFailures,
        corpusStats: {
          ...corpusStats,
          shortDuplicateRate: corpusStats.totalEntries
            ? corpusStats.shortDuplicateEntries / corpusStats.totalEntries
            : 0,
          uniqueAnswerCount: usageByAnswer.size,
        },
        sourceTemplateCount: sourcePuzzleIds.length,
        repeatedAnswers: Array.from(repeatedAnswerCounts.entries())
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 25)
          .map(([answer, count]) => ({ answer, count })),
      });
      response.end();
      return;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/studio.html")) {
      await serveStaticFile(response, path.join(viewerRoot, "studio.html"));
      return;
    }

    if (request.method === "GET" && url.pathname === "/viewer.html") {
      await serveStaticFile(response, path.join(viewerRoot, "index.html"));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Server error",
    });
  }
});

server.listen(port, () => {
  process.stdout.write(`Puzzle Studio running at http://127.0.0.1:${port}/studio.html\n`);
});
