import { GeneratorLab } from "@/components/generator-lab";
import { listGeneratedPuzzleFiles, readGeneratedPuzzle } from "@/lib/crossword/generated-puzzles";
import { listGridTemplateIds } from "@/lib/crossword/templates";

export default async function GeneratorPage({
  searchParams,
}: {
  searchParams?: Promise<{ file?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const files = await listGeneratedPuzzleFiles();
  const selectedFile = typeof params.file === "string" ? params.file : files[0] ?? null;
  const selectedPuzzle = selectedFile ? await readGeneratedPuzzle(selectedFile) : null;
  const templateIds = await listGridTemplateIds();

  return (
    <GeneratorLab
      files={files}
      selectedFile={selectedFile}
      selectedPuzzle={selectedPuzzle}
      templateIds={templateIds}
    />
  );
}
