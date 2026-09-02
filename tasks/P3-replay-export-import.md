# P3 — Replay controls, session export and import, replay summary

**Status:** done — 2026-09-02
**PR:** [#5](https://github.com/natdexterra/spotcheck/pull/5)
**Depends on:** P2 (branches from `main`)

## Goal

The fallback becomes a complete, controllable replay and the session becomes a file. After this task: `Play sample session` runs under `Play` / `Pause` / `Next call` / `Restart` with a step counter and a "next:" line; the replay has one owner with a defined lifecycle (end, stop on error, take-over, start over) that never wedges persistence and never loses the viewer's own live session; the confirm summary of a replayed session shows the recorded review time (and "this run" when the viewer finished it by hand); `Export session` downloads the change log in the fixture format from the strip, the log drawer and the summary; `Import session` in the log drawer replays a downloaded file with the same controls (B1, B8). Two rules found in the first live run land here too: the collapsed log bar is one line, and mono runs are one size step under the sans beside them.

## Sources, in order of authority

1. `build-spec.md` § Fixture and replay, § Screens 5 (summary), § Component inventory (`ReplayControls`, `ChangeLogDrawer` + import input), § Size and performance budgets.
2. `DESIGN.md` — tokens, interaction states, spacing roles and the two lanes, § Typography (the mono companion size), "labels never wrap, bars stack", § Choice controls (a native file input stays native), motion.
3. `docs/design/15-replay-row-states.png` (the replay row in its four states, desktop and 390) and `16-change-log-export-import.png` (expanded header with Export/Import, the import error line, the one-line collapsed bar, the 390 sheet header); `09` and `14` for the strip and sheet they sit in. Where an export and a rule disagree the rule wins (the exports label the disclosure "23 entries"; the shipped label "Show change log" stays). The pull request carries screenshots at 1920, 1366 and 390 for each replay-row state.
4. `docs/scenarios.md` — B1, B8, S10, B10, B11 are this task's scenarios.

## Scope — files

| Path | Responsibility |
|---|---|
| `src/replay/controller.ts` (create) | the single replay owner: `startSample()`, `startImported(fixture, label)`, `leave()`; holds the instance from `createReplay`, its label ("Sample session" / "Imported session"), `recordedAt`, the step total, `error`, `finishedByViewer`, `recordedMs`; the snapshot of the saved live session taken before the replay suspends persistence; `subscribe()` for the hook |
| `src/replay/replay.ts` (modify) | `next()` catches a thrown step: pauses, records the error, keeps persistence suspended; exposes `ended` (position === steps.length), `total`, `error`, `finishedByViewer` (a `confirm` that was not applied by the fixture) and `recordedMs` (fixture offsets: the first `propose_field` / `report_conflict` / `report_missing` step → the `confirm` step, or the last step when the fixture never confirms; the same start as P2 § Confirm's "Reviewed in" — a `draft_clarification` call does not start the clock) |
| `src/replay/describe.ts` (create) | `describeStep(step)` → the "next:" phrase (table below) |
| `src/replay/persistence.ts` (modify) | `readSavedSession()` and `saveNow()`; `startPersistence` unchanged |
| `src/replay/serialization.ts` (modify) | `exportSession(recorded_at?, pretty?)` — the download is pretty-printed (two-space indent); storage stays compact |
| `src/hooks/useReplay.ts` (create) | `useSyncExternalStore` over the controller: `{ active, label, recordedAt, position, total, playing, ended, error, next, finishedByViewer, recordedMs }` |
| `src/lib/download.ts` (create) | `downloadJson(name, text)`: Blob → object URL → `<a download>` click → revoke; no library |
| `src/components/ReplayControls.tsx` (create) | the replay row (§ Replay row); rendered by `StatusStrip` under the quiet line while a replay is active |
| `src/components/StatusStrip.tsx` (modify) | the `Export session` button (secondary compact, per DESIGN.md § Interaction states) fills the existing export slot in `live`; renders `ReplayControls`; `onPlaySample` calls `startSample()` |
| `src/components/ChangeLogDrawer.tsx` (modify) | collapsed bar one line; read entries name what was read (§ Collapsed log bar); expanded header gains `Export session` and `Import session` (file input) with an error line |
| `src/components/ConfirmSummary.tsx` (modify) | the review-time line per § Summary; `Export session` beside `Start over`; `Start over` goes through `controller.leave()` |
| `src/App.tsx` (modify) | no replay ref; the strip and the summary reach the controller through the hook; unmount calls `leave()` |
| `src/styles/tokens.css`, `src/styles/components.css` (modify) | `--text-lg-mono`; replay row, controls, import control, ellipsis on the collapsed log sentence |
| `data/sample-session.json` (modify) | `recorded_at` becomes an ISO date (`2026-09-01`); no step changes |
| `src/webmcp-tools.ts` (modify, description text only) | one sentence appended to the `propose_field` description — see § Tool description; no other change to this file |
| `e2e/replay.spec.ts` (create) | § Tests |

No new dependency of any kind.

## UI rules (normative)

### Replay lifecycle

- One replay at a time, owned by the controller. `Play sample session` → `startSample()`; a file accepted by the import control → `startImported()`. Starting a replay while one is attached leaves the old one first (below).
- Before the replay suspends persistence the controller snapshots the saved live session (`readSavedSession()`), so the viewer's own session survives the sample: the sample is never written to storage, and a page reload during a replay restores the live session, not the sample.
- **End.** When the last step has run the replay stays attached: playing false, `ended` true, the counter reads `{total} / {total}` (26 / 26 for the current sample; the total is always the fixture's own step count), the row shows `Restart` only. Persistence stays suspended (the sample must not overwrite the saved session). When the fixture's last step is `confirm`, the strip reads `Confirmed` per the precedence rule (`confirmed` → `live` → …) and the replay row stays under it until `leave()`; the strip's export slot is `live`-only, so after confirm the export lives in the summary.
- **Stop on error.** A step that throws (an imported fixture that passed parsing but breaks a tool, a tool throwing) pauses the replay, keeps its position, sets `error` with the message; the row shows the error line and `Restart`; persistence stays suspended. `Restart` clears the error. Nothing is thrown out of `next()`; the console stays clean.
- **Take-over.** The viewer may act while paused (D14, already in `replay.ts`); a fixture estimator step on a field the viewer handled is skipped and logged as today. A viewer who confirms by hand ends the replay with `finishedByViewer` true.
- **Leave** (`controller.leave()`): called by `Start over` on the summary, by the start of another replay, and on unmount. Order: restore the snapshot with `importSession(saved)` while persistence is still suspended (an empty snapshot restores `createInitialState()`), then `replay.dispose()` (resumes persistence), then `saveNow()` once. Result: the strip returns to its pre-replay state (`waiting` or `no-api` when the snapshot was empty; `live` with the viewer's own log otherwise); tools stay registered.
- `Start over` in a live session (no replay attached) keeps today's behaviour: `replaceState(createInitialState())`, tools stay registered.

### Replay row (in the strip, under the quiet line, `--space-2` below it, no dot, on the same lane)

Text, left: `{label} · recorded {date} · {position} / {total}`, then the next-step phrase in `--ink-secondary`: "next: estimator verifies Part". Counter in mono with tabular figures. `{date}` is `recorded_at` cut to its first ten characters. States:

Superseded by P3.1 § Replay controls, simplified (2026-09-02).

| State | Text after the counter | Controls (right, in this order) |
|---|---|---|
| playing | `next: …` | `Pause` (secondary compact) · `Next call` (text, disabled while a step is in flight) · `Restart` (text) — then `Export session` (secondary compact) in the slot at the far right |
| paused | `next: …` | `Play` (secondary compact) · `Next call` · `Restart` |
| ended | `finished` | `Restart` |
| error | `stopped at step {n}: {message}` in `--state-conflict` with the conflict icon | `Restart` |

`Play` / `Pause` is one button whose label changes; it keeps focus across the change. `Restart` moves focus to `Play`. Labels never wrap; on narrow (< 1024px) the row stacks: the text line, then the controls row (wrapping, left-aligned, 44px targets). The row leaves with `leave()`; the line above it follows P2's precedence rule unchanged: `live` while the replay runs, `Confirmed` once the session is confirmed (by the fixture or by the viewer).

The "next:" phrase, from `describeStep(step)`:

| Step | Phrase |
|---|---|
| agent `list_rfq_documents` | `agent lists the documents` |
| agent `read_document` | `agent reads {document} {section}` — "spec §3", "email ¶2", "drawing detail" |
| agent `get_review_state` | `agent checks the review` |
| agent `propose_field` | `agent proposes {Field label}` |
| agent `report_conflict` / `report_missing` | `agent reports a conflict on {Field label}` / `agent reports {Field label} missing` |
| agent `draft_clarification` | `agent drafts the clarification` |
| estimator | `estimator {verb} {Field label}` with verbs verifies · edits · starts editing · enters · picks · marks not required · applies the suggestion to · dismisses the suggestion on · asks the customer about · sends the clarification for N fields · reopens · confirms the quote request |

Field labels from `fieldLabel()`, never ids.

### Export session

- `Export session` is a **secondary compact** button (DESIGN.md § Interaction states lists Export under Secondary; that table governs variants) in three places: the strip's export slot (`live` only), the expanded log drawer header (any state with at least one entry), the summary actions beside `Start over`. Disabled with an empty log.
- Downloads `spotcheck-session-{YYYY-MM-DD}T{HHmm}.json`: `exportSession()` pretty-printed, `recorded_at` = the download moment as ISO. During a replay the export is the replayed log as it stands (the same shape a live session gives — export → import → identical final state, B8).
- Focus stays on the button; the live region says "Session exported".

### Import session

- In the expanded log drawer header, right of `Export session`: a native `<input type="file" accept="application/json,.json">` labelled "Import session" — the native control is kept (DESIGN.md § Choice controls); the visible trigger is a secondary compact button like Export (two secondaries side by side, `--space-2` apart) that forwards the click, and the input stays in the tab order with the same focus ring. Narrow: the same controls in the log sheet's header, 44px targets.
- On a file: read as text → `parseFixture` → on success `startImported(fixture, "Imported session")` playing from step 0 (the drawer closes; focus moves to the strip's `Pause`); on failure an error line under the header, `--state-conflict` with the conflict icon, "Could not import: {message}", announced through the one live region; nothing else changes. The next attempt clears the line.
- Import never touches storage: the imported session is a replay and follows the lifecycle above.

### Summary

- Live session: "Reviewed in 1:48" as today.
- Replayed session finished by the fixture: "Recorded review 1:48" from `recordedMs`.
- Replayed session finished by the viewer: "Recorded review 1:48 · this run 2:31" — `this run` is today's timer (wall-clock log stamps from `startedAt` to `confirmedAt`).
- Durations through `duration(ms)` from `format.ts`; mono, tabular.

### Tool description (the one sanctioned edit to `webmcp-tools.ts`)

In the first live run the agent put a whole paragraph into `value` for `delivery`. Append to the `propose_field` description, as its last sentence: "Keep value short and as written in the source; explanation goes in rationale." Mirror the sentence in `build-spec.md` § `propose_field`. The description budget test (≤ 500 characters) stays green; nothing else in the module changes, and the dispatcher-split test proves it.

### Collapsed log bar

The collapsed bar shows the last entry's clock time and sentence on **one line**: the sentence is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` inside a `min-width: 0` flex item; agent notes are not rendered in the collapsed bar (they are in the expanded log). The disclosure button keeps its place; on narrow the bar stacks as today (sentence line, then the button), the sentence still one line with an ellipsis. The full sentence stays reachable through the expanded log; the collapsed sentence carries no `title`.

Read entries name what was read instead of the generic "Agent read the RFQ package": `Agent listed the documents` · `Agent read spec §3.1` (document short name + section id as the provenance links print them) · `Agent checked the review`. Same vocabulary as `describeStep`, past tense; one helper for both so the two never drift.

### Mono companion size (DESIGN.md § Typography, rule added 2026-09-02)

Runs of mono text set beside `lg` sans read a step larger than the sans (Geist Mono's advance width). They take `--text-lg-mono: 1.029rem` (cap-height 11) with the unchanged `lg` leading: `.field-row__value`, `.candidate-option__value`, `.suggestion-card__value`, `.inline-editor__input`. Per the approved exports (08, 11, 06) three classes are not lg at all: `.field-row__revision`, `.field-row__agent-original` and `.confirm-summary__line` are `--text-sm` mono with `--leading-sm`; `.drawing-sheet__caption` is sans `--text-md` in `--ink-secondary` (drop it from the mono group). Chips, counts, timestamps, the strip counter and the prompt stay on their tokens. Row heights do not change (same leading); the e2e layout guard extends by one assertion on the computed size of a field value.

## Order of work (test first; one commit per green step, subjects `P3 <area>: …`)

1. `replay.ts`: tests for `ended`, `total`, error capture on a throwing step (spy on `executeTool` to throw once: playing false, `error` set, position unchanged, persistence still suspended, `Restart` clears), `finishedByViewer`, `recordedMs` from a small inline fixture → implement → commit.
2. `persistence.ts`: `readSavedSession()`, `saveNow()` with tests (fake storage) → commit. `serialization.ts`: pretty export test (parses back; round-trip equal to the compact form) → commit.
3. `controller.ts` + `useReplay.ts`: tests — start snapshots storage and suspends; leave restores the snapshot, resumes, saves once (`setItem` called exactly once after leave, content equal to the snapshot); leave with an empty snapshot gives the initial state; starting a second replay leaves the first; `describe.ts` table test → commit.
4. `download.ts`: test with a stubbed `URL.createObjectURL` and anchor click → commit.
5. `ReplayControls.tsx` + strip wiring: tests per row state (labels, disabled `Next call` while busy, error line, focus after `Restart`), narrow stacking → commit.
6. `ChangeLogDrawer.tsx`: one-line collapsed sentence (class present, no notes rendered), read sentences per operation (three tests), export button disabled on an empty log, import success path (`startImported` called with the parsed fixture, drawer closes), import failure line → commit.
7. `ConfirmSummary.tsx`: the three review-time variants; `Start over` calls `leave()` when a replay is active → commit. The `propose_field` description sentence with the build-spec mirror → commit.
8. Tokens and CSS: `--text-lg-mono`, replay row, import control, ellipsis; `tokens.test.ts` spot value; the e2e layout guard assertion → commit.
9. `e2e/replay.spec.ts` (below); fix what it finds → commit. Budgets, screenshots per § Sources 3, acceptance boxes → final commit.

## Tests

Unit (vitest): listed per step. Component tests through roles and names; no snapshots.

Playwright `e2e/replay.spec.ts` (production build, `page.clock` installed):

- Controls: `Play sample session` → the row reads "Sample session · recorded 2026-09-01 · 0 / 26" (26 = the sample's step count; read it from the fixture in the test rather than hard-coding it); after `runFor(3000)` the counter advanced; `Pause` → the counter is frozen across `runFor(5000)`; `Next call` → exactly +1; `Restart` → "0 / 26", eleven "Not extracted" rows, focus on `Play`; run to the end → "26 / 26 · finished", only `Restart` visible, strip line `Confirmed`, summary showing; export from the strip is checked earlier in the run, while the strip is `live` (pause after the first proposals, click `Export session` in the strip, the download parses).
- Take-over: pause after the first proposals, verify a field by hand, resume → the fixture's step on that field is logged as skipped (existing behaviour, now covered end to end).
- Summary: fixture-finished run → "Recorded review"; viewer-finished run (pause, resolve everything by hand, confirm) → both durations present.
- Export → import: run the sample to the end (the fixture confirms, so the summary is showing), click `Export session` in the summary, capture the download (`page.waitForEvent('download')`), read its JSON (steps length equals the log length, `recorded_at` ISO); reload; `Import session` with `setInputFiles` → the row reads "Imported session"; run to the end → the field pane text equals the pre-export field pane text (B8 end to end).
- Persistence: a live-shaped session with the stubbed `modelContext` (`installModelContext`, two `propose_field` calls), then `Play sample session`, then reload → the two proposed fields are back and no sample rows; then `Play sample session`, run to the end, confirm is not possible (the fixture confirmed) so `Start over` from the summary → the two fields are back, strip `Live · 2 calls`.
- Import failure: a text file → the error line, nothing else changes, console clean.
- Narrow 390: the replay row stacks, every control ≥ 44px, no horizontal scroll; the collapsed log sentence is one line (`scrollHeight` equals one line of `--leading-md`) with the long delivery sentence from the sample.
- Console has no errors or warnings in any of the above.

## Acceptance criteria

- [x] Replay lifecycle per § UI rules: end, stop on error, take-over, leave — with the saved live session intact through a sample (the persistence e2e) and persistence resumed after `Start over`
- [x] Replay row in all four states at 1920 / 1366 / 390 (screenshots in the pull request); labels never wrap; controls stack on narrow
- [x] `Export session` in the strip, the drawer and the summary; export → import → identical final state end to end (B8)
- [x] Import control native, keyboard-reachable, error path announced
- [x] Summary review-time line in its three variants
- [x] Collapsed log bar one line with an ellipsis at every width; read entries name the document and section; the mono companion size applied to the listed classes with row heights unchanged
- [x] `pnpm test`, `pnpm e2e`, `pnpm build`, `pnpm check:inline` green; JS ≤ 180 KB gzip, CSS ≤ 26 KB; no new dependency
- [x] `webmcp-tools.ts` unchanged except the `propose_field` description sentence; `reducer.ts` and the action unions unchanged; the dispatcher-split and description-budget tests still green
- [x] Task file boxes ticked with evidence in the pull request description

Builder evidence: 268 unit tests, 37 Playwright checks, production build and inline-script check pass. JavaScript gzip: 72,339 bytes; CSS: 25,993 bytes. Acceptance evidence, independent QA and screenshots at 1920 / 1366 / 390 are in [PR #5](https://github.com/natdexterra/spotcheck/pull/5). Owner review is pending.

## Out of scope

Drawing zoom (P4). The real recorded session in `data/sample-session.json` (a data task after this one). Evals. README testing instructions.
