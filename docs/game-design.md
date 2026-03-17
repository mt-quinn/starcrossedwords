# Star Crossed Words: Game Design v0

## Premise

`Star Crossed Words` is a two-player asynchronous cooperative crossword game built on full solved crossword boards.

The shared object is a normal crossword grid. The twist is that the built-in clue list is removed. Instead, each player privately knows a subset of the answers and can only move the game forward by writing clues for the other person.

This is meant to feel like a real crossword, played slowly, through correspondence.

## Non-Negotiable Principles

1. The board is a real crossword board.
2. Players enter letters directly into squares on the grid.
3. The game uses full-size 15x15 puzzles.
4. One clue is sent at a time.
5. There is no turn-by-turn correctness feedback from the system.
6. Wrong answers are corrected through later human-written clues.
7. The interface must fit on a portrait phone screen without scrolling.

## Core Game Loop

1. Player A opens the shared board and their private answer list.
2. Player A chooses one answer they know and writes a clue for that slot.
3. Player B receives the clue along with everything a normal crossword gives them: board position, direction, length, and existing filled letters.
4. Player B edits that entry directly on the board.
5. Player B may overwrite existing letters in that slot if they think the current fill is wrong.
6. Player B then chooses one of their own known answers, writes a clue, and sends the turn back.
7. This continues until both players believe the entire board is complete.
8. Only then does the system validate the whole puzzle.

## Error Correction

The game never says "incorrect" during normal play.

If a player suspects an entry is wrong, they simply send another clue for that same slot later. The newest clue becomes the active clue for that entry, but the clue history remains part of the match record.

This means correction happens through the same mechanic as normal progress: writing a better clue.

## Information Model

### Shared
- The crossword grid
- All currently filled letters
- Entry numbering and positions
- The latest clue for any slot that has been clued
- Clue history for previously targeted entries
- Turn state

### Private
- The subset of answers known by the current player
- The draft clue being written before it is sent

## Turn Model

A turn ends when the active player sends a new clue.

That outgoing turn package contains:
- The updated board state after the player's edits
- The newly written clue
- The targeted entry for that clue

This makes the game naturally asynchronous. The board only needs to synchronize at handoff points, which fits the intended Redis-backed architecture later.

## Puzzle Knowledge Split

The default split for the prototype is:
- Player A knows alternating Across entries and alternating Down entries
- Player B receives the complementary set

The assignment exists to decide who can clue what. It does not restrict who can edit letters on the board.

## Portrait Mobile Screen Model

The entire game lives on one screen with no scrolling.

### Top Bar
- Match title
- Puzzle metadata
- Turn indicator
- Progress indicator

### Board Stage
- The full 15x15 crossword grid
- Standard crossword selection behavior
- Active cell and active entry highlighting
- Tap again to flip direction when relevant

### Clue Strip
- Current targeted entry number and direction
- Current clue text
- Entry length
- Existing letters already on the board

### Bottom Dock

The bottom dock changes by tab but never scrolls.

#### Solve
- Current incoming clue
- Prior clues for the same slot
- Quick actions like clear entry or flip direction

#### Compose
- Entry picker for answers the player knows
- Small clue composer
- Send-turn action

#### Ledger
- Compact turn history
- Re-clued entries
- Match summary

## Visual Direction

The interface should feel like a dedicated puzzle app, not a marketing page and not a generic dashboard.

Target qualities:
- Dense, precise, and compact
- Board-first
- Strong separation lines instead of stacks of cards
- Mobile-native controls
- restrained typography
- minimal wasted space

Avoid:
- giant hero text
- oversized rounded cards
- long vertical feeds
- decorative website sections

## MVP Scope

### Included
- Portrait-first single-screen layout
- Real crossword board rendering from a random `.puz` file in the local database
- Cell selection and letter entry
- Solve / Compose / Ledger tabs
- Private known-answer picker for clue composition
- Blank opening-game state with `New game` randomization

### Deferred
- Real multiplayer transport
- Account and lobby flow
- Puzzle assignment pipeline
- Final puzzle validation endpoint
- Notifications

## Implementation Notes

The first implementation should optimize for feel:
- a convincing handheld crossword surface
- a believable board interaction model
- a bottom dock that always fits on-screen

The multiplayer and Redis model can layer onto this once the single-player local turn flow feels right.
