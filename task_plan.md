# Task Plan: Portrait-First Crossword Co-op Prototype

## Goal
Create a documented, portrait-first web prototype for the asynchronous two-player crossword clueing game and begin implementation with a real single-screen mobile UI shell.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Create project structure
- [x] Document design decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Build the initial app shell
- [x] Render a real crossword grid from a `.puz` file
- [x] Implement the single-screen mobile interaction model
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Install dependencies
- [x] Verify the app boots locally
- [x] Fix any issues found
- **Status:** complete

### Phase 5: Delivery
- [x] Review output files
- [ ] Summarize the design and prototype status
- [ ] Deliver next-step recommendations
- **Status:** in_progress

## Key Questions
1. How can the single-screen portrait layout preserve a real crossword feel without introducing scrolling?
2. What minimum interaction model is enough to make the board, clue history, and composer feel like one game surface?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use a single-screen portrait layout with tabs for mode switching | Matches the user's no-scroll requirement while keeping the crossword board central |
| Treat the game as asynchronous turn exchange rather than live sync | Matches the intended slow, correspondence-like pacing |
| Start with a Next.js app shell | Good fit for Vercel deployment and server-side access to local puzzle files |
| Start each new game from a blank random 15x15 puzzle | Matches the actual game flow instead of faking an in-progress match |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `xword-dl` missing from PATH before restart | 1 | Retried after the user restarted Codex and confirmed the install |
| `next/font` could not reach Google Fonts during build | 1 | Switched to local font stacks so the app builds offline |

## Notes
- Keep the UI dense and app-like, not card-heavy.
- Favor border, rhythm, and paneling over oversized containers.
