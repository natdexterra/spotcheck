# P1 — Reducer, WebMCP tool layer, fixture replay

**Status:** done — 2026-08-31
**PR:** [#2](https://github.com/natdexterra/spotcheck/pull/2)
**Depends on:** F1 (branches from F1 until it merges)

## Goal

The product's core without visuals: the pure reducer implementing the full state machine, the seven-tool WebMCP layer with structured rejections, and deterministic fixture replay — all proven by tests, including the dispatcher-split test (T1).

## Scope — files to create

| Path | Responsibility |
|---|---|
| `src/state/reducer.ts` | pure function, **no React imports**; implements build-spec § State machine: five states, lock semantics, agent matrix, human actions, resolutions, gap set, change-log events, confirm |
| `src/state/selectors.ts` | `selectReviewState` (null/false omission, 40-char value cut, `gaps`, `unverified`), `selectGaps`, `selectBlockers` |
| `src/webmcp-tools.ts` | seven `document.modelContext.registerTool({...})` calls (literal form); loose JSON Schemas + strict in-code validation; descriptions from build-spec verbatim; annotations; `draft_clarification` lifecycle on an `AbortController` with in-flight deferral; **imports `dispatchAgent` and selectors only** |
| `src/replay/replay.ts` | feeds `data/sample-session.json` through the same reducer; agent steps via the tool layer (a replayed `FIELD_LOCKED` is a real rejection), estimator steps via `dispatchHuman`; play/pause/next/restart; skip-and-log for steps on viewer-handled fields |
| `src/data/package.ts` | loads `data/package.json` (hand-written stub fixture for now), region/section lookup, app-authored titles |
| `data/package.stub.json`, `data/sample-session.stub.json` | minimal hand stubs until the real public-domain dataset lands |
| `src/state/reducer.test.ts` | the twelve invariants from build-spec, one test each, named `invariant-01` … `invariant-12` |
| `src/webmcp-tools.test.ts` | every error code; precedence order; validation-before-lock (an unprovenanced proposal on a locked field records **no** suggestion); no-silent-merge SCHEMA message names earlier material; `covers` filtering with echo of the accepted subset; equal-value lock → `suggestion_recorded: false`; S4 unit rule; output-size test: every result over the fixture < 1,500 chars serialized |
| `src/state/dispatcher-split.test.ts` | **T1 unit half**: `webmcp-tools.ts` has no import path to `dispatchHuman` (assert on the module's import graph via a small parser check) and `AgentAction` union contains exactly the five members — a `propose`-shaped call can never produce `verified` |
| `src/replay/replay.test.ts` | export → import → identical final state (B8); replay of the stub reaches `confirmed`; skipped-step logging (the take-over rule) |

## Order of work (TDD; commit after each green step)

1. `types` already exist (F1); failing `invariant-01` (no agent action produces `verified`) → minimal reducer case → green → commit. Repeat invariant by invariant; the agent transition matrix grows test-first.
2. Human actions test-first in this order: `verify`, `edit` (+`edit_start` lock on first keystroke), `enter`, `pick`, `dismiss` (reason required), `apply`/`dismiss_suggestion`, `ask_customer`, `send` (covered fields → `asked_customer`, one log entry with diff), `reopen` (derived agent state), `confirm` (all-verified gate, auto-dismiss suggestions).
3. Selectors with omission and 40-char cut; test with a long value.
4. Tool layer: registration shapes first (getTools-visible names/annotations under a stubbed `document.modelContext`), then validation → rejection codes → suggestion precondition → covers filtering → size test.
5. `draft_clarification` lifecycle: registered ⇔ gaps ∧ ¬confirmed; abort deferred while a call is in flight (test with a pending promise).
6. Replay + export/import determinism.
7. Dispatcher-split test last — it must pass against the finished module, not a fixture of it.

## Acceptance criteria

- [x] All twelve invariant tests green; every error code covered incl. precedence and validation-before-lock
- [x] T1 unit half green: no import path from the tool module to human actions; five-member agent union asserted
- [x] Replay: export → import → identical state; stub session reaches `confirmed`; viewer-override steps skipped and logged
- [x] Every tool result over the fixture < 1,500 characters serialized
- [x] `reducer.ts` imports nothing from React or the DOM; `pnpm test` green; `pnpm build` clean
- [x] Changes to F1 files limited to: `reducer.ts` (stub replaced), `types.ts` (payloads added to existing action members — member names, both unions and the actor envelope unchanged), `store.ts` (state seeding/replacement for package load and replay import only); no changes to `App.tsx`, `main.tsx`, styles, or configs

## Out of scope

Review UI (P2), strip/replay controls UI (P3), the real public-domain dataset, Playwright tool-calling run (QA, after deploy).
