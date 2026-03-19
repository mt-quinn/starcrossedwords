"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { GeneratedPuzzleRecord } from "@/lib/crossword/types";

export function GeneratorLab({
  files,
  selectedFile,
  selectedPuzzle,
  templateIds,
}: {
  files: string[];
  selectedFile: string | null;
  selectedPuzzle: GeneratedPuzzleRecord | null;
  templateIds: string[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templateIds[0] ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/generator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        fileName?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.fileName) {
        setErrorMessage(payload.error ?? "Crossword generation failed.");
        return;
      }

      router.push(`/generator?file=${encodeURIComponent(payload.fileName)}`);
      router.refresh();
    } catch {
      setErrorMessage("Crossword generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="generator-shell">
      <section className="generator-sidebar menu-card">
        <p className="menu-eyebrow">Generator Lab</p>
        <h1>Build local crossword files.</h1>
        <p className="menu-copy">
          Generate a crossword from a fixed 15x15 template, then inspect the saved JSON file locally.
        </p>

        <label className="menu-field">
          <span>Template</span>
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templateIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button menu-button" disabled={isGenerating || !templateId} onClick={handleGenerate}>
          {isGenerating ? "Generating..." : "Generate puzzle"}
        </button>

        {errorMessage ? <p className="menu-error">{errorMessage}</p> : null}

        <div className="generator-file-list">
          <p className="menu-eyebrow">Generated Files</p>
          {files.length ? (
            files.map((file) => (
              <Link
                className={["generator-file-link", file === selectedFile ? "is-active" : ""].filter(Boolean).join(" ")}
                href={`/generator?file=${encodeURIComponent(file)}`}
                key={file}
              >
                {file.replace(/\.json$/i, "")}
              </Link>
            ))
          ) : (
            <p className="menu-copy">No generated files yet.</p>
          )}
        </div>
      </section>

      <section className="generator-preview menu-card">
        {selectedPuzzle ? (
          <>
            <div className="generator-meta">
              <div>
                <p className="menu-eyebrow">Selected File</p>
                <p className="generator-meta-line">{selectedPuzzle.fileName}</p>
              </div>
              <div>
                <p className="menu-eyebrow">Solver</p>
                <p className="generator-meta-line">
                  {selectedPuzzle.solver.maxTierUsed} tier, {selectedPuzzle.solver.durationMs} ms
                </p>
              </div>
            </div>

            <div
              className="generated-grid"
              style={{
                gridTemplateColumns: `repeat(${selectedPuzzle.puzzle.width}, minmax(0, 1fr))`,
              }}
            >
              {selectedPuzzle.puzzle.cells.map((cell) => (
                <div
                  className={["generated-cell", cell.isBlock ? "is-block" : ""].filter(Boolean).join(" ")}
                  key={cell.index}
                >
                  {!cell.isBlock ? (
                    <>
                      {cell.number ? <span className="generated-cell-number">{cell.number}</span> : null}
                      <span className="generated-cell-letter">{cell.solution}</span>
                    </>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="generator-meta">
              <div>
                <p className="menu-eyebrow">Template</p>
                <p className="generator-meta-line">{selectedPuzzle.templateId}</p>
              </div>
              <div>
                <p className="menu-eyebrow">Search</p>
                <p className="generator-meta-line">
                  {selectedPuzzle.solver.nodesVisited} nodes, {selectedPuzzle.solver.backtracks} backtracks
                </p>
              </div>
            </div>

            <div className="generator-entry-columns">
              <div className="generator-entry-column">
                <p className="menu-eyebrow">Across</p>
                {selectedPuzzle.puzzle.entries
                  .filter((entry) => entry.direction === "across")
                  .map((entry) => (
                    <p className="generator-entry-line" key={entry.id}>
                      <strong>{entry.number}A</strong> {entry.answer}
                    </p>
                  ))}
              </div>
              <div className="generator-entry-column">
                <p className="menu-eyebrow">Down</p>
                {selectedPuzzle.puzzle.entries
                  .filter((entry) => entry.direction === "down")
                  .map((entry) => (
                    <p className="generator-entry-line" key={entry.id}>
                      <strong>{entry.number}D</strong> {entry.answer}
                    </p>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="menu-eyebrow">Generator Lab</p>
            <h1>No generated puzzle selected.</h1>
            <p className="menu-copy">Generate a puzzle to save a local JSON file and preview it here.</p>
          </>
        )}
      </section>
    </main>
  );
}
