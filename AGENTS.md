# AGENTS.md

Guidance for AI coding agents (Devin etc.) and humans working in this repo.

## Project
Browser-only Battleship (human vs AI). TypeScript + Vite, no backend, no runtime dependencies.
Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Commands
- `npm ci` – install (Node 22, see `.nvmrc`)
- `npm run dev` – dev server at http://localhost:5173
- `npm test` – Vitest unit + UI (jsdom) tests
- `npm run check` – typecheck + tests + production build. **Run before every commit/PR.**

## Layout
- `src/game/` – pure game rules, **no DOM access**. `board.ts` (placement, attacks, sinking),
  `ai.ts` (hunt & target AI, evasion moves), `game.ts` (turns, phases, winner), `types.ts` (fleet, constants).
- `src/ui/app.ts` – all DOM rendering and event handling; calls `Game` and re-renders.
- `src/ui/sprites.ts` – top-down warship drawings as vector SVG (each ship is `length * CELL` x `CELL`, facing right),
  rotated / mirrored per orientation and sliced into one SVG data URL per cell (checked by `tests/sprites.test.ts`).
- `src/ui/record.ts` – win / loss record in localStorage (`battleship-record`); inject `createRecordStore(null)` in tests.
- `src/ui/sound.ts` – hit/sunk sound effects synthesised with Web Audio (no audio files); `mountApp` accepts a fake
  `SoundPlayer` via `options.sound` so tests stay silent.
- `tests/` – one test file per module; `tests/app.test.ts` drives the UI in jsdom with fake timers.
- `docs/` – beginner-friendly explanation (`how-it-works.md`) and bug log (`bug-report.md`, English copy `bug-report.en.md`).

## Rules
- Keep game logic in `src/game/` and pure; inject randomness (`Random`) so tests are deterministic
  (use `seededRandom` from `tests/helpers.ts`).
- Every bug fix gets a regression test and a short entry in `docs/bug-report.md` (Japanese)
  and the same entry in `docs/bug-report.en.md` (English); keep the two in sync.
- UI text is Japanese; code, identifiers and commit messages are English.
- Do not add runtime dependencies without a clear reason.
- When a feature changes how the game or code is organised, update the page list in `.devin/wiki.json`
  in the same PR, then regenerate the Devin wiki after merging.
