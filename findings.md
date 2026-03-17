# Findings & Decisions

## Requirements
- Build a two-player cooperative crossword game around full 15x15 puzzle boards.
- Preserve real crossword interaction: cell-by-cell entry in the grid.
- Use a single-screen portrait-mobile layout with no scrolling.
- Keep the board, clueing, and turn exchange feeling like a dedicated mobile app rather than a responsive website.
- Players can overwrite existing letters in a target slot if they believe the current fill is wrong.
- The game does not validate entries turn by turn; validation only happens on final puzzle completion.
- Wrong answers are corrected socially through follow-up clues for the same slot.

## Research Findings
- The repository currently contains puzzle files and utility scripts, but no existing web app to preserve.
- A `.puz` file contains the full solved crossword grid, block pattern, title metadata, and numbered clue ordering, which is enough to render a real board.
- The user wants a real crossword pace and explicitly rejects mini-puzzle compromises, packetized clue turns, scaffolding, and non-grid entry patterns.
- The correct startup state is a fresh blank board, not a mocked in-progress conversation.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Load a random 15x15 `.puz` from `Puzzle Database` when a new game starts | Makes the prototype behave like the real game rather than a canned sample |
| Model the UI around three modes: solve, compose, and ledger | Preserves a single-screen layout while keeping necessary game actions available |
| Keep the board shared and mutable without cell ownership rules | Matches the final rules the user approved |
| Start new matches in `Compose` mode with an empty board and empty clue history | Reflects the opening move of the actual game |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Earlier discussion drifted away from real crossword play | Reset to a crossword-native model centered on grid entry, clue exchange, and slow cooperative solving |
| Build failed when `next/font` tried to fetch Google Fonts | Replaced remote fonts with local stacks to keep the build offline-safe |

## Resources
- `/Users/quinn/Documents/starcrossedwords/Puzzle Database`
- `/Users/quinn/Documents/starcrossedwords/scripts/generate_xword_dl_commands.py`
- `/Users/quinn/.agents/skills/frontend-design/SKILL.md`
- `/Users/quinn/.agents/skills/mobile-design/SKILL.md`
- `/Users/quinn/.agents/skills/writing-specs-designs/SKILL.md`

## Visual/Browser Findings
- The right visual tone is dense, precise, and mobile-native: a board-first surface with tabs, separators, and compact controls rather than stacked cards and oversized hero sections.
- The app reads more truthfully when the board opens empty and the UI clearly asks for an opening clue instead of showing invented turn history.
