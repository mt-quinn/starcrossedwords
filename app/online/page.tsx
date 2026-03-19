import { listCuratedGeneratedPuzzleNumbers } from "@/lib/crossword/curated-puzzles";
import { OnlineLobby } from "@/components/online-lobby";

export default async function OnlinePage() {
  const curatedPuzzleNumbers = await listCuratedGeneratedPuzzleNumbers().catch(() => []);
  return <OnlineLobby curatedPuzzleNumbers={curatedPuzzleNumbers} />;
}
