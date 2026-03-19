import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
  GridTemplate,
  TemplateModel,
  TemplateSlot,
} from "@/lib/crossword/types";
import type { ParsedPuzzle, PuzzleCell, PuzzleEntry } from "@/lib/puz";

const GRID_TEMPLATE_DIR = path.join(process.cwd(), "data", "grid-templates");

let templateIdPromise: Promise<string[]> | null = null;
const templatePromiseCache = new Map<string, Promise<GridTemplate>>();

async function readTemplateFile(templateId: string): Promise<GridTemplate> {
  const safeTemplateId = path.basename(templateId, ".json");
  const templatePath = path.join(GRID_TEMPLATE_DIR, `${safeTemplateId}.json`);
  const template = JSON.parse(await readFile(templatePath, "utf8")) as GridTemplate;
  const errors = validateGridTemplate(template);

  if (errors.length) {
    throw new Error(`Invalid grid template \`${safeTemplateId}\`:\n- ${errors.join("\n- ")}`);
  }

  return template;
}

export async function listGridTemplateIds(): Promise<string[]> {
  if (!templateIdPromise) {
    templateIdPromise = readdir(GRID_TEMPLATE_DIR).then((names) =>
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.basename(name, ".json"))
        .sort(),
    );
  }

  return templateIdPromise;
}

export async function loadGridTemplate(templateId: string): Promise<GridTemplate> {
  const safeTemplateId = path.basename(templateId, ".json");
  let cachedTemplate = templatePromiseCache.get(safeTemplateId);

  if (!cachedTemplate) {
    cachedTemplate = readTemplateFile(safeTemplateId);
    templatePromiseCache.set(safeTemplateId, cachedTemplate);
  }

  return cachedTemplate;
}

export function validateGridTemplate(template: GridTemplate): string[] {
  const errors: string[] = [];

  if (!template.id.trim()) {
    errors.push("Template id is required.");
  }

  if (template.width <= 0 || template.height <= 0) {
    errors.push("Template width and height must be positive.");
    return errors;
  }

  if (template.rows.length !== template.height) {
    errors.push("Template row count must match height.");
    return errors;
  }

  for (const [rowIndex, row] of template.rows.entries()) {
    if (row.length !== template.width) {
      errors.push(`Row ${rowIndex + 1} width does not match template width.`);
    }

    if (!/^[.#]+$/.test(row)) {
      errors.push(`Row ${rowIndex + 1} contains invalid characters.`);
    }
  }

  if (errors.length) {
    return errors;
  }

  for (let row = 0; row < template.height; row += 1) {
    for (let col = 0; col < template.width; col += 1) {
      const cell = template.rows[row][col];
      const mirrored = template.rows[template.height - 1 - row][template.width - 1 - col];

      if (cell !== mirrored) {
        errors.push("Template must have 180-degree rotational symmetry.");
        row = template.height;
        break;
      }
    }
  }

  const whiteCellIndices: number[] = [];
  const isWhiteCell = (row: number, col: number) => template.rows[row][col] === ".";

  for (let row = 0; row < template.height; row += 1) {
    for (let col = 0; col < template.width; col += 1) {
      if (isWhiteCell(row, col)) {
        whiteCellIndices.push(row * template.width + col);
      }
    }
  }

  if (!whiteCellIndices.length) {
    errors.push("Template must contain at least one white cell.");
    return errors;
  }

  const visited = new Set<number>();
  const queue = [whiteCellIndices[0]];

  while (queue.length) {
    const index = queue.shift() as number;

    if (visited.has(index)) {
      continue;
    }

    visited.add(index);
    const row = Math.floor(index / template.width);
    const col = index % template.width;
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];

    for (const [nextRow, nextCol] of neighbors) {
      if (
        nextRow >= 0 &&
        nextRow < template.height &&
        nextCol >= 0 &&
        nextCol < template.width &&
        isWhiteCell(nextRow, nextCol)
      ) {
        queue.push(nextRow * template.width + nextCol);
      }
    }
  }

  if (visited.size !== whiteCellIndices.length) {
    errors.push("Template white cells must form a single connected region.");
  }

  const acrossLengths: number[] = [];
  const downLengths: number[] = [];

  for (let row = 0; row < template.height; row += 1) {
    let runLength = 0;

    for (let col = 0; col <= template.width; col += 1) {
      if (col < template.width && isWhiteCell(row, col)) {
        runLength += 1;
        continue;
      }

      if (runLength > 0) {
        acrossLengths.push(runLength);
        runLength = 0;
      }
    }
  }

  for (let col = 0; col < template.width; col += 1) {
    let runLength = 0;

    for (let row = 0; row <= template.height; row += 1) {
      if (row < template.height && isWhiteCell(row, col)) {
        runLength += 1;
        continue;
      }

      if (runLength > 0) {
        downLengths.push(runLength);
        runLength = 0;
      }
    }
  }

  if (acrossLengths.some((length) => length < 3) || downLengths.some((length) => length < 3)) {
    errors.push("Template cannot contain across or down slots shorter than 3.");
  }

  const puzzle = buildPuzzleFromTemplateUnchecked(template);
  const uncheckedCells = puzzle.cells.filter(
    (cell) => !cell.isBlock && (!cell.acrossEntryId || !cell.downEntryId),
  );

  if (uncheckedCells.length) {
    errors.push("Template contains unchecked white cells.");
  }

  return errors;
}

function buildPuzzleFromTemplateUnchecked(template: GridTemplate): ParsedPuzzle {
  const cellCount = template.width * template.height;
  const cells: PuzzleCell[] = Array.from({ length: cellCount }, (_, index) => {
    const row = Math.floor(index / template.width);
    const col = index % template.width;
    const isBlock = template.rows[row][col] === "#";

    return {
      index,
      row,
      col,
      isBlock,
      solution: "",
      value: "",
    };
  });

  const entries: PuzzleEntry[] = [];
  let cellNumber = 1;

  for (let row = 0; row < template.height; row += 1) {
    for (let col = 0; col < template.width; col += 1) {
      const index = row * template.width + col;
      const cell = cells[index];

      if (cell.isBlock) {
        continue;
      }

      const startsAcross = col === 0 || cells[index - 1].isBlock;
      const startsDown = row === 0 || cells[index - template.width].isBlock;

      if (!startsAcross && !startsDown) {
        continue;
      }

      const number = cellNumber;
      cell.number = number;
      cellNumber += 1;

      if (startsAcross) {
        const cellIndices: number[] = [];
        let cursor = index;

        while (cursor < row * template.width + template.width && !cells[cursor].isBlock) {
          cellIndices.push(cursor);
          cells[cursor].acrossEntryId = `${number}A`;
          cursor += 1;
        }

        entries.push({
          id: `${number}A`,
          number,
          direction: "across",
          row,
          col,
          length: cellIndices.length,
          answer: "",
          clue: "",
          cellIndices,
        });
      }

      if (startsDown) {
        const cellIndices: number[] = [];
        let cursor = index;

        while (cursor < cellCount && !cells[cursor].isBlock) {
          cellIndices.push(cursor);
          cells[cursor].downEntryId = `${number}D`;
          cursor += template.width;
        }

        entries.push({
          id: `${number}D`,
          number,
          direction: "down",
          row,
          col,
          length: cellIndices.length,
          answer: "",
          clue: "",
          cellIndices,
        });
      }
    }
  }

  return {
    title: template.title,
    author: "Generator Template",
    copyright: template.sourcePuzzleId ? `Template from ${template.sourcePuzzleId}` : "",
    width: template.width,
    height: template.height,
    cells,
    entries,
  };
}

function buildTemplateSlots(puzzle: ParsedPuzzle): TemplateSlot[] {
  const slotById = new Map<string, TemplateSlot>(
    puzzle.entries.map((entry) => [
      entry.id,
      {
        id: entry.id,
        number: entry.number,
        direction: entry.direction,
        row: entry.row,
        col: entry.col,
        length: entry.length,
        cellIndices: entry.cellIndices,
        crossings: [],
      },
    ]),
  );

  for (const cell of puzzle.cells) {
    if (cell.isBlock || !cell.acrossEntryId || !cell.downEntryId) {
      continue;
    }

    const acrossSlot = slotById.get(cell.acrossEntryId);
    const downSlot = slotById.get(cell.downEntryId);

    if (!acrossSlot || !downSlot) {
      continue;
    }

    const acrossPosition = acrossSlot.cellIndices.indexOf(cell.index);
    const downPosition = downSlot.cellIndices.indexOf(cell.index);

    acrossSlot.crossings.push({
      cellIndex: cell.index,
      otherSlotId: downSlot.id,
      slotPosition: acrossPosition,
      otherSlotPosition: downPosition,
    });
    downSlot.crossings.push({
      cellIndex: cell.index,
      otherSlotId: acrossSlot.id,
      slotPosition: downPosition,
      otherSlotPosition: acrossPosition,
    });
  }

  return puzzle.entries.map((entry) => slotById.get(entry.id) as TemplateSlot);
}

export function buildTemplateModel(template: GridTemplate): TemplateModel {
  const errors = validateGridTemplate(template);

  if (errors.length) {
    throw new Error(`Invalid grid template \`${template.id}\`:\n- ${errors.join("\n- ")}`);
  }

  const puzzle = buildPuzzleFromTemplateUnchecked(template);
  return {
    template,
    puzzle,
    slots: buildTemplateSlots(puzzle),
  };
}

export async function loadTemplateModel(templateId: string): Promise<TemplateModel> {
  return buildTemplateModel(await loadGridTemplate(templateId));
}

export function materializeFilledPuzzle(
  model: TemplateModel,
  answersBySlotId: Record<string, string>,
): ParsedPuzzle {
  const cells = model.puzzle.cells.map((cell) => ({
    ...cell,
    solution: "",
    value: "",
  }));
  const entries = model.puzzle.entries.map((entry) => {
    const answer = answersBySlotId[entry.id] ?? "";

    if (answer.length !== entry.length) {
      throw new Error(`Missing or invalid answer for slot ${entry.id}.`);
    }

    entry.cellIndices.forEach((cellIndex, position) => {
      cells[cellIndex].solution = answer[position];
    });

    return {
      ...entry,
      answer,
      clue: "",
    };
  });

  return {
    ...model.puzzle,
    title: `${model.template.title} Generated Fill`,
    author: "Star-crossed Words Generator",
    copyright: model.template.sourcePuzzleId
      ? `Template derived from ${model.template.sourcePuzzleId}`
      : "Generated by Star-crossed Words",
    cells,
    entries,
  };
}
