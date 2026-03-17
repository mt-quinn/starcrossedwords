export type EntryDirection = "across" | "down";

export interface PuzzleCell {
  index: number;
  row: number;
  col: number;
  isBlock: boolean;
  solution: string;
  value: string;
  number?: number;
  acrossEntryId?: string;
  downEntryId?: string;
}

export interface PuzzleEntry {
  id: string;
  number: number;
  direction: EntryDirection;
  row: number;
  col: number;
  length: number;
  answer: string;
  clue: string;
  cellIndices: number[];
}

export interface ParsedPuzzle {
  title: string;
  author: string;
  copyright: string;
  width: number;
  height: number;
  cells: PuzzleCell[];
  entries: PuzzleEntry[];
}

const HEADER_OFFSET = 0x34;

function readLatinString(buffer: Buffer): string {
  return buffer.toString("latin1");
}

function readPuzStrings(buffer: Buffer, start: number, count: number): string[] {
  const values: string[] = [];
  let cursor = start;

  while (cursor < buffer.length && values.length < count) {
    const terminator = buffer.indexOf(0x00, cursor);

    if (terminator === -1) {
      values.push(readLatinString(buffer.subarray(cursor)));
      break;
    }

    values.push(readLatinString(buffer.subarray(cursor, terminator)));
    cursor = terminator + 1;
  }

  return values;
}

export function parsePuz(buffer: Buffer): ParsedPuzzle {
  const width = buffer[0x2c];
  const height = buffer[0x2d];
  const clueCount = buffer.readUInt16LE(0x2e);
  const cellCount = width * height;

  const solution = readLatinString(buffer.subarray(HEADER_OFFSET, HEADER_OFFSET + cellCount));
  const fill = readLatinString(
    buffer.subarray(HEADER_OFFSET + cellCount, HEADER_OFFSET + cellCount * 2),
  );
  const strings = readPuzStrings(buffer, HEADER_OFFSET + cellCount * 2, 3 + clueCount);
  const [title = "Untitled", author = "", copyright = "", ...clues] = strings;

  const cells: PuzzleCell[] = Array.from({ length: cellCount }, (_, index) => {
    const solutionValue = solution[index] === "." ? "" : solution[index];
    const fillValue = fill[index] === "-" || fill[index] === "." ? "" : fill[index];

    return {
      index,
      row: Math.floor(index / width),
      col: index % width,
      isBlock: solution[index] === ".",
      solution: solutionValue,
      value: fillValue,
    };
  });

  const entries: PuzzleEntry[] = [];
  let clueIndex = 0;
  let cellNumber = 1;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      const cell = cells[index];

      if (cell.isBlock) {
        continue;
      }

      const startsAcross = col === 0 || cells[index - 1].isBlock;
      const startsDown = row === 0 || cells[index - width].isBlock;

      if (!startsAcross && !startsDown) {
        continue;
      }

      const number = cellNumber;
      cell.number = number;
      cellNumber += 1;

      if (startsAcross) {
        const cellIndices: number[] = [];
        let cursor = index;

        while (cursor < row * width + width && !cells[cursor].isBlock) {
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
          answer: cellIndices.map((cellIndex) => cells[cellIndex].solution).join(""),
          clue: clues[clueIndex] ?? "",
          cellIndices,
        });
        clueIndex += 1;
      }

      if (startsDown) {
        const cellIndices: number[] = [];
        let cursor = index;

        while (cursor < cellCount && !cells[cursor].isBlock) {
          cellIndices.push(cursor);
          cells[cursor].downEntryId = `${number}D`;
          cursor += width;
        }

        entries.push({
          id: `${number}D`,
          number,
          direction: "down",
          row,
          col,
          length: cellIndices.length,
          answer: cellIndices.map((cellIndex) => cells[cellIndex].solution).join(""),
          clue: clues[clueIndex] ?? "",
          cellIndices,
        });
        clueIndex += 1;
      }
    }
  }

  return {
    title,
    author,
    copyright,
    width,
    height,
    cells,
    entries,
  };
}
