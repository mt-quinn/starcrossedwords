"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ClueEvent, GameView } from "@/lib/game-types";
import type { EntryDirection, PuzzleCell, PuzzleEntry } from "@/lib/puz";

type Sheet = "bank" | null;

function slotLabel(entry: PuzzleEntry): string {
  return `${entry.number}${entry.direction === "across" ? "A" : "D"}`;
}

function entryTitle(entry: PuzzleEntry): string {
  return `${entry.number} ${entry.direction === "across" ? "Across" : "Down"}`;
}

function fillPattern(entry: PuzzleEntry, board: string[]): string {
  return entry.cellIndices.map((cellIndex) => board[cellIndex] || "·").join("");
}

function authoredByYou(history: ClueEvent[] | undefined): boolean {
  return Boolean(history?.some((item) => item.author === "you"));
}

function flipDirection(direction: EntryDirection): EntryDirection {
  return direction === "across" ? "down" : "across";
}

function latestClue(history: ClueEvent[] | undefined): ClueEvent | undefined {
  return history?.[history.length - 1];
}

function hasPartnerClue(history: ClueEvent[] | undefined): boolean {
  return Boolean(history?.some((item) => item.author === "partner"));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getCameraBounds(
  scale: number,
  viewportStart: number,
  viewportSize: number,
): { min: number; max: number } {
  return {
    min: viewportStart + viewportSize - scale,
    max: viewportStart,
  };
}

export function GameShell({
  game,
  interactionLocked = false,
  onBoardChange,
  onSendClue,
}: {
  game: GameView;
  interactionLocked?: boolean;
  onBoardChange?: (board: string[]) => void;
  onSendClue?: (entryId: string, clue: string) => void;
}) {
  const captureRef = useRef<HTMLInputElement>(null);
  const boardFrameRef = useRef<HTMLDivElement>(null);
  const boardHeadingRef = useRef<HTMLDivElement>(null);
  const guidedPanelRef = useRef<HTMLElement>(null);
  const panPointerIdRef = useRef<number | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, dragged: false });
  const suppressTapRef = useRef(false);
  const entryMap = useMemo(
    () => Object.fromEntries(game.puzzle.entries.map((entry) => [entry.id, entry])),
    [game.puzzle.entries],
  );
  const [board, setBoard] = useState(game.board);
  const [selectedEntryId, setSelectedEntryId] = useState(game.currentEntryId);
  const [selectedCellIndex, setSelectedCellIndex] = useState(
    entryMap[game.currentEntryId].cellIndices[0],
  );
  const [direction, setDirection] = useState<EntryDirection>(
    entryMap[game.currentEntryId].direction,
  );
  const [bankDirection, setBankDirection] = useState<EntryDirection>("across");
  const [draftClue, setDraftClue] = useState("");
  const [clueHistory, setClueHistory] = useState(game.clueHistory);
  const [reclueEntryId, setReclueEntryId] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<Sheet>(null);
  const [isZoomPreviewActive, setIsZoomPreviewActive] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [flipMessage, setFlipMessage] = useState<string | null>(null);
  const [manualPan, setManualPan] = useState({ x: 0, y: 0 });
  const [boardViewportMetrics, setBoardViewportMetrics] = useState({
    left: 0,
    top: 0,
    centerX: 0.5,
    centerY: 0.5,
    visibleWidth: 1,
    visibleHeight: 1,
  });

  const puzzleAcross = game.puzzle.entries.filter((entry) => entry.direction === "across");
  const puzzleDown = game.puzzle.entries.filter((entry) => entry.direction === "down");
  const knownEntryIdSet = new Set(game.knownEntryIds);
  const knownEntries = game.puzzle.entries.filter((entry) => knownEntryIdSet.has(entry.id));
  const knownAcross = knownEntries.filter((entry) => entry.direction === "across");
  const knownDown = knownEntries.filter((entry) => entry.direction === "down");
  const bankEntries = bankDirection === "across" ? knownAcross : knownDown;
  const selectedEntry = entryMap[selectedEntryId];
  const selectedHistory = clueHistory[selectedEntry.id] ?? [];
  const latestSelectedClue = latestClue(selectedHistory);
  const latestOwnClue = [...selectedHistory].reverse().find((item) => item.author === "you");
  const uncluedKnownCount = knownEntries.filter(
    (entry) => !authoredByYou(clueHistory[entry.id]),
  ).length;
  const isOwnEntry = knownEntryIdSet.has(selectedEntry.id);
  const hasIncoming = hasPartnerClue(selectedHistory);
  const canFillSelectedEntry = hasIncoming && !isOwnEntry && !interactionLocked;
  const canClueSelectedEntry = isOwnEntry && !interactionLocked;
  const isReclueMode = reclueEntryId === selectedEntry.id;
  const actionableAcross = puzzleAcross.filter(
    (entry) => knownEntryIdSet.has(entry.id) || hasPartnerClue(clueHistory[entry.id]),
  );
  const actionableDown = puzzleDown.filter(
    (entry) => knownEntryIdSet.has(entry.id) || hasPartnerClue(clueHistory[entry.id]),
  );
  const actionableEntries = [...actionableAcross, ...actionableDown];
  const boardCameraScale = 1.392;
  const boardCanvasPadding = 0.4;
  const boardWorldUnits = 1 + boardCanvasPadding * 2;
  const boardAspectRatio = game.puzzle.width / game.puzzle.height;
  const boardBaseFraction = 1 / boardWorldUnits;
  const boardWidthFraction =
    boardAspectRatio >= 1 ? boardBaseFraction : boardBaseFraction * boardAspectRatio;
  const boardHeightFraction =
    boardAspectRatio >= 1 ? boardBaseFraction / boardAspectRatio : boardBaseFraction;
  const boardLeftFraction = (1 - boardWidthFraction) / 2;
  const boardTopFraction = (1 - boardHeightFraction) / 2;
  const previewBoardScale = boardViewportMetrics.visibleHeight / boardHeightFraction;
  const defaultBoardScale = boardCameraScale;
  const selectedEntryRows = selectedEntry.cellIndices.map((cellIndex) => game.puzzle.cells[cellIndex].row);
  const selectedEntryCols = selectedEntry.cellIndices.map((cellIndex) => game.puzzle.cells[cellIndex].col);
  const minRow = Math.min(...selectedEntryRows);
  const maxRow = Math.max(...selectedEntryRows) + 1;
  const minCol = Math.min(...selectedEntryCols);
  const maxCol = Math.max(...selectedEntryCols) + 1;
  const entryWidthFraction = ((maxCol - minCol) / game.puzzle.width) * boardWidthFraction;
  const entryHeightFraction = ((maxRow - minRow) / game.puzzle.height) * boardHeightFraction;
  const fitEntryScale = Math.min(
    entryWidthFraction > 0
      ? (boardViewportMetrics.visibleWidth * 0.96) / entryWidthFraction
      : Infinity,
    entryHeightFraction > 0
      ? (boardViewportMetrics.visibleHeight * 0.92) / entryHeightFraction
      : Infinity,
  );
  const boardWorldScale = isZoomPreviewActive
    ? previewBoardScale
    : Math.min(defaultBoardScale, fitEntryScale);
  const centerX = (minCol + maxCol) / (2 * game.puzzle.width);
  const centerY = (minRow + maxRow) / (2 * game.puzzle.height);
  const worldCenterX = boardLeftFraction + centerX * boardWidthFraction;
  const worldCenterY = boardTopFraction + centerY * boardHeightFraction;
  const previewBoardLeft =
    boardViewportMetrics.left +
    (boardViewportMetrics.visibleWidth - boardWidthFraction * boardWorldScale) / 2;
  const desiredLeft = isZoomPreviewActive
    ? previewBoardLeft - boardLeftFraction * boardWorldScale
    : boardViewportMetrics.centerX - worldCenterX * boardWorldScale;
  const desiredTop = isZoomPreviewActive
    ? boardViewportMetrics.top - boardTopFraction * boardWorldScale
    : boardViewportMetrics.centerY - worldCenterY * boardWorldScale;
  const horizontalBounds = getCameraBounds(
    boardWorldScale,
    boardViewportMetrics.left,
    boardViewportMetrics.visibleWidth,
  );
  const verticalBounds = getCameraBounds(
    boardWorldScale,
    boardViewportMetrics.top,
    boardViewportMetrics.visibleHeight,
  );
  const boardCameraLeft = isZoomPreviewActive
    ? desiredLeft
    : clamp(
        desiredLeft + manualPan.x,
        horizontalBounds.min,
        horizontalBounds.max,
      );
  const boardCameraTop = isZoomPreviewActive
    ? desiredTop
    : clamp(
        desiredTop + manualPan.y,
        verticalBounds.min,
        verticalBounds.max,
      );
  const boardCameraStyle = {
    width: `${boardWorldScale * 100}%`,
    height: `${boardWorldScale * 100}%`,
    left: `${boardCameraLeft * 100}%`,
    top: `${boardCameraTop * 100}%`,
  };
  const boardGridStyle = {
    left: `${boardLeftFraction * 100}%`,
    top: `${boardTopFraction * 100}%`,
    width: `${boardWidthFraction * 100}%`,
    height: `${boardHeightFraction * 100}%`,
    gridTemplateColumns: `repeat(${game.puzzle.width}, minmax(0, 1fr))`,
  };

  useEffect(() => {
    if (!flipMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFlipMessage(null);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [flipMessage]);

  useEffect(() => {
    setBoard(game.board);
  }, [game.board]);

  useEffect(() => {
    setClueHistory(game.clueHistory);
  }, [game.clueHistory]);

  useEffect(() => {
    const currentEntry = entryMap[game.currentEntryId];

    if (!currentEntry) {
      return;
    }

    setSelectedEntryId(game.currentEntryId);
    setSelectedCellIndex(currentEntry.cellIndices[0]);
    setDirection(currentEntry.direction);
    setDraftClue("");
    setReclueEntryId(null);
    setActiveSheet(null);
  }, [entryMap, game.currentEntryId]);

  useEffect(() => {
    const boardFrame = boardFrameRef.current;

    if (!boardFrame) {
      return;
    }

    function handleWheelEvent(event: WheelEvent) {
      if (isZoomPreviewActive) {
        return;
      }

      const currentBoardFrame = boardFrameRef.current;

      if (!currentBoardFrame) {
        return;
      }

      event.preventDefault();
      const frameRect = currentBoardFrame.getBoundingClientRect();

      setManualPan((currentPan) => ({
        x: currentPan.x - event.deltaX / frameRect.width,
        y: currentPan.y - event.deltaY / frameRect.height,
      }));
    }

    boardFrame.addEventListener("wheel", handleWheelEvent, { passive: false });

    return () => {
      boardFrame.removeEventListener("wheel", handleWheelEvent);
    };
  }, [isZoomPreviewActive]);

  useEffect(() => {
    setManualPan({ x: 0, y: 0 });
  }, [selectedEntryId]);

  useLayoutEffect(() => {
    function measureViewport() {
      const boardFrame = boardFrameRef.current;

      if (!boardFrame) {
        return;
      }

      const boardFrameRect = boardFrame.getBoundingClientRect();
      const guidedPanelRect = guidedPanelRef.current?.getBoundingClientRect();
      const topInset = 0;
      const bottomInset = guidedPanelRect
        ? Math.max(boardFrameRect.bottom - guidedPanelRect.top, 0)
        : 0;
      const sideInset = 0;
      const visibleTop = topInset;
      const visibleBottom = Math.max(boardFrameRect.height - bottomInset, visibleTop);
      const visibleLeft = sideInset;
      const visibleRight = Math.max(boardFrameRect.width - sideInset, visibleLeft);
      const nextCenter = {
        left: visibleLeft / boardFrameRect.width,
        top: visibleTop / boardFrameRect.height,
        centerX: (visibleLeft + visibleRight) / (2 * boardFrameRect.width),
        centerY: (visibleTop + visibleBottom) / (2 * boardFrameRect.height),
        visibleWidth: (visibleRight - visibleLeft) / boardFrameRect.width,
        visibleHeight: (visibleBottom - visibleTop) / boardFrameRect.height,
      };

      setBoardViewportMetrics((currentCenter) => {
        if (
          Math.abs(currentCenter.left - nextCenter.left) < 0.001 &&
          Math.abs(currentCenter.top - nextCenter.top) < 0.001 &&
          Math.abs(currentCenter.centerX - nextCenter.centerX) < 0.001 &&
          Math.abs(currentCenter.centerY - nextCenter.centerY) < 0.001 &&
          Math.abs(currentCenter.visibleWidth - nextCenter.visibleWidth) < 0.001 &&
          Math.abs(currentCenter.visibleHeight - nextCenter.visibleHeight) < 0.001
        ) {
          return currentCenter;
        }

        return nextCenter;
      });
    }

    measureViewport();

    const resizeObserver = new ResizeObserver(() => {
      measureViewport();
    });

    if (boardFrameRef.current) {
      resizeObserver.observe(boardFrameRef.current);
    }

    if (boardHeadingRef.current) {
      resizeObserver.observe(boardHeadingRef.current);
    }

    if (guidedPanelRef.current) {
      resizeObserver.observe(guidedPanelRef.current);
    }

    window.addEventListener("resize", measureViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureViewport);
    };
  }, []);

  function isActionableEntry(entry: PuzzleEntry | undefined): entry is PuzzleEntry {
    return Boolean(entry && (knownEntryIdSet.has(entry.id) || hasPartnerClue(clueHistory[entry.id])));
  }

  function isFillableEntry(entry: PuzzleEntry | undefined): entry is PuzzleEntry {
    return Boolean(entry && hasPartnerClue(clueHistory[entry.id]) && !knownEntryIdSet.has(entry.id));
  }

  function getCellTone(cell: PuzzleCell): "you" | "partner" | "clued" | "filled" | "default" {
    if (cell.isBlock) {
      return "default";
    }

    const cellValue = board[cell.index];

    if (cellValue) {
      return "filled";
    }

    const relatedEntryIds = [cell.acrossEntryId, cell.downEntryId].filter(
      (entryId): entryId is string => Boolean(entryId),
    );
    const inOwnBank = relatedEntryIds.some((entryId) => knownEntryIdSet.has(entryId));
    const hasIncomingClue = relatedEntryIds.some((entryId) => hasPartnerClue(clueHistory[entryId]));

    if (hasIncomingClue) {
      return "clued";
    }

    if (inOwnBank) {
      return "you";
    }

    if (relatedEntryIds.length) {
      return "partner";
    }

    return "default";
  }

  function focusCapture(entryOverride?: PuzzleEntry) {
    const targetEntry = entryOverride ?? selectedEntry;

    if (!isFillableEntry(targetEntry)) {
      captureRef.current?.blur();
      return;
    }

    captureRef.current?.focus();
  }

  function focusEntryOnBoard(entry: PuzzleEntry) {
    setSelectedEntryId(entry.id);
    setSelectedCellIndex(entry.cellIndices[0]);
    setDirection(entry.direction);
    setReclueEntryId(null);
    setDraftClue("");
  }

  function getDirectionalActionables(entryDirection: EntryDirection): PuzzleEntry[] {
    return entryDirection === "across" ? actionableAcross : actionableDown;
  }

  function getDirectionalEntries(entryDirection: EntryDirection): PuzzleEntry[] {
    return entryDirection === "across" ? puzzleAcross : puzzleDown;
  }

  function findNextActionableFromEntry(entry: PuzzleEntry, step: 1 | -1): PuzzleEntry | null {
    const currentDirectionEntries = getDirectionalEntries(entry.direction);
    const currentDirectionActionables = getDirectionalActionables(entry.direction);
    const currentIndex = currentDirectionEntries.findIndex((item) => item.id === entry.id);

    if (currentIndex !== -1) {
      for (
        let index = currentIndex + step;
        index >= 0 && index < currentDirectionEntries.length;
        index += step
      ) {
        const candidate = currentDirectionEntries[index];
        if (isActionableEntry(candidate)) {
          return candidate;
        }
      }
    }

    const otherDirection = flipDirection(entry.direction);
    const otherDirectionActionables = getDirectionalActionables(otherDirection);

    if (otherDirectionActionables.length) {
      return step === 1
        ? otherDirectionActionables[0]
        : otherDirectionActionables[otherDirectionActionables.length - 1];
    }

    if (currentDirectionActionables.length) {
      return step === 1
        ? currentDirectionActionables[0]
        : currentDirectionActionables[currentDirectionActionables.length - 1];
    }

    return null;
  }

  function navigateActionable(step: 1 | -1) {
    const nextEntry = findNextActionableFromEntry(selectedEntry, step);

    if (!nextEntry) {
      return;
    }

    focusEntryOnBoard(nextEntry);
    focusCapture(nextEntry);
  }

  function syncBankDirection(entry: PuzzleEntry) {
    if (knownEntryIdSet.has(entry.id)) {
      setBankDirection(entry.direction);
    }
  }

  function resolveActionableEntry(cell: PuzzleCell, preferredDirection: EntryDirection): PuzzleEntry | null {
    const preferredId =
      preferredDirection === "across"
        ? cell.acrossEntryId ?? cell.downEntryId
        : cell.downEntryId ?? cell.acrossEntryId;
    const alternateId =
      preferredDirection === "across"
        ? cell.downEntryId ?? cell.acrossEntryId
        : cell.acrossEntryId ?? cell.downEntryId;

    const preferredEntry = preferredId ? entryMap[preferredId] : undefined;
    const alternateEntry = alternateId ? entryMap[alternateId] : undefined;

    if (isActionableEntry(preferredEntry)) {
      return preferredEntry;
    }

    if (isActionableEntry(alternateEntry)) {
      return alternateEntry;
    }

    if (preferredEntry) {
      return findNextActionableFromEntry(preferredEntry, 1);
    }

    if (alternateEntry) {
      return findNextActionableFromEntry(alternateEntry, 1);
    }

    return actionableEntries[0] ?? null;
  }

  function getEntryForDirection(cell: PuzzleCell, targetDirection: EntryDirection): PuzzleEntry | null {
    const entryId =
      targetDirection === "across"
        ? cell.acrossEntryId ?? null
        : cell.downEntryId ?? null;

    return entryId ? entryMap[entryId] : null;
  }

  function moveSelection(step: number, entryOverride?: PuzzleEntry) {
    const activeEntry = entryOverride ?? selectedEntry;
    const position = activeEntry.cellIndices.indexOf(selectedCellIndex);

    if (position === -1) {
      setSelectedCellIndex(activeEntry.cellIndices[0]);
      return;
    }

    const nextPosition = Math.max(
      0,
      Math.min(activeEntry.cellIndices.length - 1, position + step),
    );

    setSelectedCellIndex(activeEntry.cellIndices[nextPosition]);
  }

  function applyLetter(letter: string) {
    if (!/^[A-Z]$/.test(letter) || !canFillSelectedEntry) {
      return;
    }

    setBoard((currentBoard) => {
      const nextBoard = [...currentBoard];
      nextBoard[selectedCellIndex] = letter;
      onBoardChange?.(nextBoard);
      return nextBoard;
    });

    moveSelection(1);
  }

  function deleteLetter() {
    if (!canFillSelectedEntry) {
      return;
    }

    const position = selectedEntry.cellIndices.indexOf(selectedCellIndex);
    const currentValue = board[selectedCellIndex];

    if (currentValue) {
      setBoard((currentBoard) => {
        const nextBoard = [...currentBoard];
        nextBoard[selectedCellIndex] = "";
        onBoardChange?.(nextBoard);
        return nextBoard;
      });
      return;
    }

    if (position > 0) {
      const previousCellIndex = selectedEntry.cellIndices[position - 1];
      setSelectedCellIndex(previousCellIndex);
      setBoard((currentBoard) => {
        const nextBoard = [...currentBoard];
        nextBoard[previousCellIndex] = "";
        onBoardChange?.(nextBoard);
        return nextBoard;
      });
    }
  }

  function handleCaptureChange(event: ChangeEvent<HTMLInputElement>) {
    const lettersOnly = event.target.value.toUpperCase().replace(/[^A-Z]/g, "");

    if (!lettersOnly) {
      event.target.value = "";
      return;
    }

    applyLetter(lettersOnly.at(-1) ?? "");
    event.target.value = "";
  }

  function handleCaptureKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      deleteLetter();
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      handleFlipDirection();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    }
  }

  function handleFlipDirection() {
    const selectedCell = game.puzzle.cells[selectedCellIndex];
    const nextDirection = flipDirection(direction);
    const nextEntry = getEntryForDirection(selectedCell, nextDirection);

    if (!nextEntry) {
      return;
    }

    if (!isActionableEntry(nextEntry)) {
      setFlipMessage("Unknown Clue");
      return;
    }

    focusEntryOnBoard(nextEntry);
    syncBankDirection(nextEntry);
    focusCapture(nextEntry);
  }

  function handleCellTap(cell: PuzzleCell) {
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }

    if (cell.isBlock) {
      return;
    }

    const shouldFlip =
      selectedCellIndex === cell.index && Boolean(cell.acrossEntryId && cell.downEntryId);
    const preferredDirection = shouldFlip ? flipDirection(direction) : direction;
    const nextEntry = resolveActionableEntry(cell, preferredDirection);

    setActiveSheet(null);
    setSelectedCellIndex(cell.index);

    if (nextEntry) {
      focusEntryOnBoard(nextEntry);
      syncBankDirection(nextEntry);
    }

    focusCapture(nextEntry ?? undefined);
  }

  function clearSelectedEntry() {
    if (!canFillSelectedEntry) {
      return;
    }

    setBoard((currentBoard) => {
      const nextBoard = [...currentBoard];

      selectedEntry.cellIndices.forEach((cellIndex) => {
        nextBoard[cellIndex] = "";
      });

      onBoardChange?.(nextBoard);
      return nextBoard;
    });

    setSelectedCellIndex(selectedEntry.cellIndices[0]);
    focusCapture(selectedEntry);
  }

  function openBankSheet(seedEntry?: PuzzleEntry) {
    syncBankDirection(seedEntry ?? selectedEntry);
    setActiveSheet("bank");
  }

  function startReclue() {
    setReclueEntryId(selectedEntry.id);
    setDraftClue(latestOwnClue?.clue ?? "");
  }

  function cancelReclue() {
    setReclueEntryId(null);
    setDraftClue("");
  }

  function sendTurn() {
    if (!canClueSelectedEntry || !draftClue.trim()) {
      return;
    }

    const clueText = draftClue.trim();

    if (onSendClue) {
      onSendClue(selectedEntry.id, clueText);
    } else {
      const timestamp = "Now";
      const nextTurn =
        Math.max(
          game.turnNumber,
          ...Object.values(clueHistory).flatMap((history) => history.map((item) => item.turn)),
        ) + 1;

      setClueHistory((currentHistoryMap) => ({
        ...currentHistoryMap,
        [selectedEntry.id]: [
          ...(currentHistoryMap[selectedEntry.id] ?? []),
          {
            entryId: selectedEntry.id,
            author: "you",
            clue: clueText,
            turn: nextTurn,
            timestamp,
          },
        ],
      }));
    }

    setDraftClue("");
    setReclueEntryId(null);
  }

  function handleBoardWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleBoardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isZoomPreviewActive) {
      return;
    }

    panPointerIdRef.current = event.pointerId;
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: manualPan.x,
      panY: manualPan.y,
      dragged: false,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleBoardPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (panPointerIdRef.current !== event.pointerId || isZoomPreviewActive) {
      return;
    }

    const boardFrame = boardFrameRef.current;

    if (!boardFrame) {
      return;
    }

    const frameRect = boardFrame.getBoundingClientRect();
    const deltaX = (event.clientX - panStartRef.current.x) / frameRect.width;
    const deltaY = (event.clientY - panStartRef.current.y) / frameRect.height;

    if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
      panStartRef.current.dragged = true;
    }

    setManualPan({
      x: panStartRef.current.panX + deltaX,
      y: panStartRef.current.panY + deltaY,
    });
  }

  function handleBoardPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (panPointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (panStartRef.current.dragged) {
      suppressTapRef.current = true;
      window.setTimeout(() => {
        suppressTapRef.current = false;
      }, 0);
    }

    panPointerIdRef.current = null;
    setIsPanning(false);
  }

  return (
    <main className="app-shell">
      <div className="device-frame">
        <section className="board-stage">
          <div className="board-heading" ref={boardHeadingRef}>
            <div className="board-heading-actions">
              {Math.abs(manualPan.x) > 0.001 || Math.abs(manualPan.y) > 0.001 ? (
                <button
                  className="ghost-button compact-button"
                  onClick={() => setManualPan({ x: 0, y: 0 })}
                  type="button"
                >
                  Recenter
                </button>
              ) : null}
              <button
                className="ghost-button compact-button"
                onPointerDown={() => setIsZoomPreviewActive(true)}
                onPointerUp={() => setIsZoomPreviewActive(false)}
                onPointerLeave={() => setIsZoomPreviewActive(false)}
                onPointerCancel={() => setIsZoomPreviewActive(false)}
                type="button"
              >
                Zoom
              </button>
            </div>
          </div>

          <div
            className={["board-frame", isPanning ? "is-panning" : ""].filter(Boolean).join(" ")}
            onPointerDown={handleBoardPointerDown}
            onPointerMove={handleBoardPointerMove}
            onPointerUp={handleBoardPointerEnd}
            onPointerCancel={handleBoardPointerEnd}
            onWheel={handleBoardWheel}
            ref={boardFrameRef}
          >
            <div className="board-camera" style={boardCameraStyle}>
              <div
                className="board-grid"
                style={boardGridStyle}
              >
                {game.puzzle.cells.map((cell) => {
                const inFocusEntry =
                  !isZoomPreviewActive &&
                  !cell.isBlock &&
                  selectedEntry.cellIndices.includes(cell.index);
                const isSelectedCell = !isZoomPreviewActive && cell.index === selectedCellIndex;
                  const cellValue = board[cell.index];
                  const cellTone = getCellTone(cell);

                  return (
                    <button
                      key={cell.index}
                      className={[
                        "board-cell",
                        cell.isBlock ? "is-block" : "",
                        inFocusEntry ? "is-active-entry" : "",
                        isSelectedCell ? "is-active-cell" : "",
                        cellTone === "you" ? "is-you-bank" : "",
                        cellTone === "partner" ? "is-partner-bank" : "",
                        cellTone === "clued" ? "is-clued-cell" : "",
                        cellTone === "filled" ? "is-filled-cell" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleCellTap(cell)}
                      type="button"
                      aria-label={
                        cell.isBlock
                          ? "Block"
                          : `Row ${cell.row + 1} column ${cell.col + 1}, ${cellValue || "empty"}`
                      }
                    >
                      {!cell.isBlock && (
                        <>
                          {!isZoomPreviewActive && cell.number ? (
                            <span className="cell-number">{cell.number}</span>
                          ) : null}
                          <span className="cell-letter">{cellValue}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              ref={captureRef}
              className="entry-capture"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              readOnly={!canFillSelectedEntry}
              onChange={handleCaptureChange}
              onKeyDown={handleCaptureKeyDown}
              aria-label="Crossword input capture"
            />
          </div>
        </section>

        <section className="guided-panel" ref={guidedPanelRef}>
          <button
            aria-label="Previous actionable clue"
            className="nav-arrow"
            onClick={() => navigateActionable(-1)}
            type="button"
          >
            ‹
          </button>

          <div className="guided-panel-body">
            <div className="dock-head">
              <div className="dock-slot">
                <span className="direction-chip">{entryTitle(selectedEntry)}</span>
              </div>

              <div className="dock-tools">
                <button className="ghost-button compact-button" onClick={handleFlipDirection} type="button">
                  {flipMessage ?? "Flip"}
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={clearSelectedEntry}
                  type="button"
                  disabled={!canFillSelectedEntry}
                >
                  Clear
                </button>
              </div>
            </div>

            {hasIncoming ? (
              <div className="clue-meta">
                <span>{selectedEntry.length} letters</span>
                <strong>{fillPattern(selectedEntry, board)}</strong>
              </div>
            ) : null}

            {isOwnEntry ? (
              <div className="guided-content">
                <div className="guided-answer">
                  <p className="sheet-label">Your answer</p>
                  <p className="guided-answer-value">{selectedEntry.answer}</p>
                </div>

                {latestOwnClue && !isReclueMode ? (
                  <>
                    <div className="guided-card">
                      <p className="sheet-label">Previous clue</p>
                      <p className="clue-line">{latestOwnClue.clue}</p>
                    </div>
                    <div className="guided-actions">
                      <button className="ghost-button" onClick={() => openBankSheet()} type="button">
                        Bank
                      </button>
                      <button
                        className="primary-button"
                        onClick={startReclue}
                        type="button"
                        disabled={!canClueSelectedEntry}
                      >
                        Reclue
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="composer">
                      <span>{latestOwnClue ? "Update clue" : "Write clue"}</span>
                      <textarea
                        rows={1}
                        maxLength={120}
                        placeholder="Write the clue here..."
                        value={draftClue}
                        disabled={!canClueSelectedEntry}
                        onChange={(event) => setDraftClue(event.target.value)}
                      />
                    </label>
                    <div className="guided-actions">
                      <button
                        className="ghost-button"
                        onClick={isReclueMode ? cancelReclue : () => openBankSheet()}
                        type="button"
                      >
                        {isReclueMode ? "Cancel" : "Bank"}
                      </button>
                      <button
                        className="primary-button"
                        onClick={sendTurn}
                        type="button"
                        disabled={!canClueSelectedEntry || !draftClue.trim()}
                      >
                        {latestOwnClue ? "Send reclue" : "Send clue"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : hasIncoming ? (
              <div className="guided-content">
                <div className="guided-card">
                  <p className="sheet-label">Incoming clue</p>
                  <p className="clue-line">{latestSelectedClue?.clue ?? "No clue yet."}</p>
                </div>
                <p className="clue-note">
                  {interactionLocked
                    ? "Waiting for the other player to finish their turn."
                    : "Type directly into the grid, or use the arrows to move to the next actionable clue."}
                </p>
                <div className="guided-actions">
                  <button className="ghost-button" onClick={() => openBankSheet()} type="button">
                    Bank
                  </button>
                </div>
              </div>
            ) : (
              <div className="guided-content">
                <p className="clue-note">This slot is not actionable right now.</p>
              </div>
            )}
          </div>

          <button
            aria-label="Next actionable clue"
            className="nav-arrow"
            onClick={() => navigateActionable(1)}
            type="button"
          >
            ›
          </button>
        </section>

        {activeSheet === "bank" ? (
          <div className="sheet-layer" role="presentation">
            <button
              aria-label="Close panel"
              className="sheet-scrim"
              onClick={() => setActiveSheet(null)}
              type="button"
            />

            <section aria-label="Answer bank" className="sheet-panel" role="dialog">
              <div className="sheet-grabber" />
              <div className="sheet-header">
                <div>
                  <p className="eyebrow">Your answers</p>
                  <h2>Answer bank</h2>
                  <p className="sheet-subtitle">
                    {uncluedKnownCount} fresh of {knownEntries.length} known answers
                  </p>
                </div>
                <button className="ghost-button compact-button" onClick={() => setActiveSheet(null)} type="button">
                  Close
                </button>
              </div>

              <div className="compose-direction">
                <button
                  className={bankDirection === "across" ? "is-active" : ""}
                  onClick={() => setBankDirection("across")}
                  type="button"
                >
                  Across
                </button>
                <button
                  className={bankDirection === "down" ? "is-active" : ""}
                  onClick={() => setBankDirection("down")}
                  type="button"
                >
                  Down
                </button>
              </div>

              <div className="sheet-block">
                <div className="sheet-row">
                  <p className="sheet-label">Available answers</p>
                  <span className="sheet-counter">{bankEntries.length}</span>
                </div>

                <div className="bank-list">
                  {bankEntries.length ? (
                    bankEntries.map((entry) => (
                      <button
                        key={entry.id}
                        className={[
                          "bank-row",
                          selectedEntry.id === entry.id ? "is-selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          focusEntryOnBoard(entry);
                          setActiveSheet(null);
                          focusCapture(entry);
                        }}
                        type="button"
                      >
                        <span className="slot-pill">{slotLabel(entry)}</span>
                        <span className="bank-answer">
                          <strong>{entry.answer}</strong>
                          <span>
                            {entry.length} letters ·{" "}
                            {authoredByYou(clueHistory[entry.id]) ? "Reclue" : "Fresh"}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-copy">No known answers are loaded for this direction yet.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
