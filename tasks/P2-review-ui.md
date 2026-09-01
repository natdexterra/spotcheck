# P2 — Review UI: two panes, provenance both ways, resolutions

**Status:** queued (ready for the builder)
**PR:** —
**Depends on:** P1.1 (branches from `main`)

## Goal

The visible product: the review workspace driven by the store — header and status strip, risk-ordered field rows in the five states with every resolution badge, the conflict panel, the suggestion card, the inline editor, the not-required picker, the source pane with two-way provenance including the drawing overlay, the clarification editor, the confirm footer and summary, the change-log drawer, the live region and the keyboard map — plus the boot wiring that registers the tools on load. After this task the app is usable end to end in a WebMCP browser and, through `Play sample session`, in any browser.

## Sources, in order of authority

1. `build-spec.md` § Screens, § Component inventory, § Field taxonomy, § Size and performance budgets.
2. `DESIGN.md` — every token, the interaction-states table, the spacing-role table and the two-lane rule, the layout ladder, iconography, focus, motion. A value not in `DESIGN.md` is not a token; an off-scale spacing value is a defect.
3. `docs/design/` — exports of the approved screens (`README.md` there lists them). Match them; where an export and a rule in `DESIGN.md` disagree, the rule wins (mock pixel sizes approximate the rem ladder).
4. § UI rules below — the behaviour that the screens do not show. Normative.
5. `docs/scenarios.md` — S1–S10, B3–B5, B9–B11, T4 are this task's scenarios; their Evidence column is the QA script.

## Scope — files

Create under `src/components/` (one component per file, `.tsx`; styles in `src/styles/components.css`, class names in BEM: `field-row`, `field-row__value`, `field-row__badge--verified`):

| Path | Responsibility |
|---|---|
| `src/styles/tokens.css` (modify) | re-transcribe from the current `DESIGN.md`: add `--page-margin`, `--accent-strong`, `--bg-subtle`, `--ink-hover`, `--ink-active`, `--highlight`, `--highlight-edge`, `--dur-1`, `--dur-2` if missing; extend `tokens.test.ts` spot values by these |
| `src/styles/base.css` (modify) | `color-scheme: light`; body defaults; `:focus-visible` ring; `@media (prefers-reduced-motion: reduce)` block; `.untrusted` rule (no prose styling) |
| `src/styles/components.css` | all component styles; no color or size literal that duplicates a token |
| `src/lib/format.ts` | `relativeTime(at, now)` → "0:42 ago"; `duration(ms)` → "1:48"; `fieldLabel(id)` from the taxonomy; `badgeText(field)` and `groupLabel(state)` per § Badges |
| `src/lib/contrast.ts` + test | WCAG contrast of two hex colors; the test re-runs the `DESIGN.md` ledger pairs against `tokens.css` |
| `src/hooks/useReview.ts` | `useSyncExternalStore(subscribe, getState)` + memoised selectors (risk order, groups, gaps, blockers, draft, timer) |
| `src/hooks/useKeyboardMap.ts` | `j` / `k` / `Enter` / `e` / `n` / `Esc` per § Keyboard; inert while an input has focus |
| `Header.tsx` | product name, tagline, package title from `data/package.json` |
| `StatusStrip.tsx` | states `no-api` / `waiting` / `live` / `confirmed`; quiet summary line; `Show tools` disclosure with the roster; copyable prompt; `Play sample session` button (wired to `createReplay().play()`; controls are P3) |
| `FieldList.tsx` | risk sort, group headings with counts, collapsed verified group, the empty-state header line |
| `FieldRow.tsx` | marker bar, label, value + unit, badge (icon + text), lock glyph, provenance links, agent note / rationale, `was: X`, actions per state, suggestion-card slot |
| `Badge.tsx` | icon + text from state / `resolution.kind`; `aria-label` carries the short label |
| `ConflictPanel.tsx`, `CandidateOption.tsx` | candidates stacked, each with value, source links, note, `Pick`; "Enter another value" opens the editor |
| `SuggestionCard.tsx` | agent value, source links, rationale as quoted "agent's reason", "your value, {resolution} {time} ago", `Apply` · `Dismiss` |
| `InlineEditor.tsx` | value input, unit input on `overall_dimensions`, validation line, `Save` / `Cancel`; `edit_start` on the first keystroke |
| `NotRequiredPicker.tsx` | three presets + free text; `Mark not required` / `Cancel` |
| `Button.tsx`, `ProvenanceLink.tsx`, `JumpLink.tsx` | the classes from the `DESIGN.md` interaction-states table; nothing else may style a button or link |
| `SourcePane.tsx`, `EmailDoc.tsx`, `SpecDoc.tsx`, `DrawingSheet.tsx`, `OverlayBox.tsx` | tabs, regions rendered via text nodes only, reading marker, provenance flash, region click → field focus; the WebP sheet with normalized overlay boxes; the narrow sheet mode |
| `ClarificationEditor.tsx` | subject, body, covers checkboxes limited to current gaps, `Send`, `Discard` |
| `ConfirmFooter.tsx`, `ConfirmSummary.tsx` | disabled button with the blocker line and jump links; the summary |
| `ChangeLogDrawer.tsx` | collapsed with the last entry; expanded full log; the narrow full-height sheet; Export / Import controls are P3 |
| `LiveRegion.tsx` | the one polite region with the batching rules |
| `src/icons/*.tsx`, `src/icons/LICENSE` | MynaUI line icons copied in as inline SVG components (MIT text alongside) plus the custom composites from the `DESIGN.md` table |
| `src/App.tsx`, `src/main.tsx` (modify) | boot: `registerTools()` when `typeof document.modelContext?.registerTool === "function"`, `startPersistence()`, `?quiet=1` flag into context; layout shell |
| `vite.config.ts` (modify) | `test.include` also `src/**/*.test.tsx`; component tests declare `// @vitest-environment jsdom` per file so reducer tests stay in node |
| `e2e/review.spec.ts`, `e2e/tools.spec.ts`, `e2e/narrow.spec.ts`, `e2e/a11y.spec.ts` | see § Tests |

Allowed new devDependencies: `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`. **No new runtime dependency** (icons are copied sources, not a package).

## UI rules (normative; the screens show the rest)

### Shell

- Header, strip, workspace and log drawer take inline padding from `--page-margin`; content inside a pane sits on the gutter lane. Every left edge lands on one of the two lanes.
- Desktop ≥ 1024px: `grid-template-columns: minmax(480px, 640px) minmax(460px, 1fr)`, gap `--space-6`; below 1024px one column, content capped at 680px above ~600px. No horizontal page scroll at 320px.
- First load (screen 1): field-pane header "0 of 11 verified", eleven rows "— · Not extracted", one line "Your agent reads the documents → fields fill with sources → you verify and confirm", Email tab open, Confirm disabled with "11 to check", drawer "No activity yet".

### Status strip

| State | When | Text | Control |
|---|---|---|---|
| `no-api` | `typeof document.modelContext?.registerTool !== "function"` | "Live mode needs a WebMCP-capable desktop browser: the ChatGPT desktop app's browser, or Chrome 149+ with the WebMCP flag." | `Play sample session` (primary) |
| `waiting` | API present, no tool call yet | "Waiting for your agent. In the chat, ask:" + the prompt "Extract this RFQ into a quote request" in mono with a `Copy` text button | `Play sample session` (secondary) |
| `live` | first tool call received or replay started | quiet line "Live · 7 tools · 23 calls · last: propose_field material" + `Show tools` disclosure | — |
| `confirmed` | session confirmed | "Confirmed" + the roster line | — |

Roster (disclosure open): one row per registered tool in registration order — name in mono, read/write marker mirroring `readOnlyHint`, call count; a tool whose last call was rejected shows the code. The last-called row is highlighted for 2 s. When `draft_clarification` registers its row enters highlighted and the count reads "6 → 7 tools" for 2 s; when it unregisters the row leaves. While a draft exists and the editor is closed, the summary line carries a `Open draft` text button. No countdown, no auto-start.

### Field pane

- Risk order: `conflict` → `missing` → `needs_review` → `empty` → `verified`. Group headings with counts ("2 conflicts", "1 missing", "3 to review", "2 not extracted"); verified collapse under "5 verified ▸" (disclosure text button; expanded rows stay in resolution order, newest first).
- Row anatomy, top to bottom: label (md, `--ink-secondary`) · value + unit (lg, mono, 500; "—" when null) · badge (icon + text) with the lock glyph when `locked` · provenance links, one per `source_ref` · one line of agent rationale or note, sans, prefixed "Agent:" · "was: X" when `revised` is set · actions · suggestion-card slot.
- Actions per state (text buttons unless noted):

| State | Actions |
|---|---|
| `needs_review` | `Verify` (secondary; reads `Add unit` and opens the editor when `overall_dimensions` has no unit) · `Edit` · `Ask customer` (toggle; pressed state visible without color) |
| `conflict` | the conflict panel: candidates with value, source links, note, `Pick` (secondary); `Enter another value` opens the editor |
| `missing` | searched-document chips · the note · `Enter value` (secondary) · `Not required` |
| `empty` | `Enter value` (secondary) · `Not required` |
| `verified` | badge with resolution and time · `Reopen`; for `edited` / `picked` / `applied` the original agent value with its source ("agent 800 · spec §2.1") |
| any, suggestion pending | the card |

- A `verified` field with `value: null` reads "Not required" or "Asked customer", never "Verified". A locked field where the agent later called a report tool shows the note "Agent: reported a conflict on this field after you set it · see log" linking to the log entry.
- Reopened row: `needs_review` (or the derived agent state) plus lock; value line reads "your entry: 750"; the agent value and source stay visible.

### Badges

Two wordings, one icon set (`DESIGN.md` § State iconography):

- **Row badge** — human wording: `empty` "Not extracted" · `needs_review` "Needs review" / "Unit missing" · `conflict` "Two sources disagree" · `missing` "Not found" · verified by kind: "Verified by you · 0:42 ago", "Edited by you · …", "Entered by you · …", "Picked by you · …", "Not required · …", "Applied from agent · …", "Asked customer · …".
- **Short label** — group headings, counts, blocker line, summary, announcements, the badge's `aria-label`: Not extracted · Needs review · Conflict · Missing · Verified · Edited · Entered · Picked · Not required · Applied · Asked customer.

Relative times update once a minute; tabular figures; mono.

### Inline editor

- Opens from `Edit`, `Enter value`, `Enter another value`, `Add unit`, `e`, or `Enter` on a unit-less `overall_dimensions`. Opening does not lock; the **first keystroke dispatches `edit_start` exactly once** per editor session.
- Value input prefilled with the current value (empty for `empty`); on `overall_dimensions` a unit input (`in` | `mm`) beside it; the app line "no unit given" when the unit is empty.
- `Enter` or `Save` dispatches `edit` (or `enter` on an `empty` field) with value and unit — save is verify. `Esc` or `Cancel` dispatches nothing, closes, returns focus to the row's primary action.
- Validation before dispatch: empty value → "Enter a value or cancel"; `quantity` non-integer → "Quantity is a whole number"; `overall_dimensions` without unit → "Choose in or mm". Error line in `--state-conflict` with an icon; input border in the same color; `aria-describedby` on the input.
- While an editor is open, an incoming agent proposal on that field arrives as a suggestion card under the editor (the field is locked); the editor keeps its value and focus.

### Not required

Inline picker under the row (gray fill, no border): three presets as a radio group — "Not required for this quote", "Covered by our shop standard", "Will confirm at PO" — plus "Other reason" free text. `Mark not required` dispatches `dismiss` with the reason; disabled until a preset or non-empty text is chosen. `Cancel` closes; focus returns to `Not required`.

### Suggestion card

Rendered when `field.suggestion` exists. Agent value and unit, its source links first, its rationale as a quotation labelled "agent's reason", then "your value, edited 0:42 ago". `Apply` dispatches `apply`, `Dismiss` dispatches `dismiss_suggestion`; both move focus to the badge. Never green; never replaces the value display.

### Source pane

- Tabs Email · Specification · Drawing (48px document lane shared by tabs and text). Email and spec render regions as blocks with their ids in mono; **every document string, rationale and note is inserted as a text node** — no `dangerouslySetInnerHTML`, no markdown, no link detection.
- Provenance link (`spec §1.1`, `email ¶2`, `drawing width`) → switches tab, scrolls the region into view, flashes it (`--highlight` in over `--dur-1`, held 2 s, out over 400 ms; static `--highlight-edge` outline under reduced motion). Clicking a highlighted region or overlay box focuses that field's row (reverse direction).
- Reading marker: after each `read` log entry the read tab shows a "reading" marker and the section flashes, for 2 s; reads are not announced.
- Drawing tab: `data/drawing-sheet1.webp` at its intrinsic aspect ratio; overlay boxes from `package.json` `box: [x, y, w, h]` as fractions of the image, positioned with percentages so they follow any width; dashed `--highlight-edge` at rest, filled `--highlight` when active; `drawing:title_area` is the clickable blank corner with the caption "a revision letter would live here; there is none"; `drawing:detail` has no boxes. Caption line "Sheet 1 of 4 · regions are clickable".
- `?quiet=1`: the `email:note` region is not rendered.
- Narrow (< 1024px): the pane is a sheet over the list opened by a provenance link, with a header (document title + tabs), a `Close` control ≥ 44px, and a footer link "Back to {field}"; `Esc` and `Close` return focus to the link that opened it. Body scroll is locked while the sheet is open.

### Clarification editor

Opens when the session has a `draft` (the agent called `draft_clarification`) — a panel over the source pane on desktop, a sheet on narrow. Subject and body inputs prefilled from the draft (agent text is data: prefill, never interpret); covers as checkboxes pre-checked from the draft and limited to current gaps; `Send` (primary) dispatches `send` with the edited subject, body and checked covers; `Discard` closes the panel without dispatch (the draft stays in state; `Open draft` in the strip reopens it). After `Send` the panel closes and focus goes to the first covered field's badge.

### Confirm

- Footer of the field pane, sticky. Button disabled until `canConfirm`; blocker line with jump links: "3 to check · 1 conflict · 1 missing · 2 not extracted"; pending suggestions listed beside it ("2 suggestions pending"), not blocking.
- Confirm replaces the field pane with the summary: title "Confirmed" or "Confirmed with N open questions" (`asked_customer` count); "Reviewed in 1:48" — from the first `propose` / `report_*` log entry to the `confirm` entry, using log timestamps; counts per resolution kind; "agent independently agreed on N fields"; lists: edits "agent X → yours Y", picks with the losing candidate, dismissals with reasons, fields pending customer answer, suggestions auto-dismissed at confirm; the full change log; `Start over` (resets to the initial state via `replaceState(createInitialState())`; tools stay registered). `Export session` is P3.
- After confirm the strip reads "Confirmed"; the source pane still works.

### Change log drawer

Collapsed: one line, the last entry ("estimator verified part_name · 0:12 ago") and a disclosure. Expanded: the full log, newest last, actor named on every entry, agent text in sans with the "Agent:" prefix, rejections with their code; a `skipped` replay entry renders as such. Narrow: a full-height sheet with `Close`.

### Keyboard (B9)

`j` / `k` move focus between flagged rows (conflict, missing, needs_review, empty, in risk order); `Enter` on a focused row triggers its primary action; `e` opens the editor; `n` opens the not-required picker where allowed; `Esc` closes the editor, picker, sheet or panel. The map is inert while focus is inside an input, textarea or button. Every binding has a visible focused state and a pointer equivalent.

### Announcements (B11)

One polite live region. One by one: agent flags ("quantity: conflict reported by the agent", "general tolerance: reported missing"), every human action ("material: verified"), tool registration changes ("draft_clarification available, 7 tools"), rejections that produce a card. Plain proposals are batched: "3 fields proposed", flushed every 3 s. Reads are not announced.

## Order of work (test first where testable; one commit per green step, subjects `P2 <area>: …`)

1. Test infrastructure: `jsdom` + Testing Library, `vite.config.ts` include pattern, a trivial component test → commit. `tokens.css` re-transcription with the extended spot test; `contrast.test.ts` against the ledger pairs → commit.
2. `format.ts` (relative time, duration, labels, badge text) with tests → commit.
3. `Button`, `ProvenanceLink`, `JumpLink`, icons with license; a test that every icon component renders an `<svg>` with `aria-hidden` → commit.
4. `Header`, `StatusStrip`: tests for state selection (API missing / present-no-call / live / confirmed), roster counts and rejection code, `Open draft` presence → commit.
5. `Badge`, `FieldRow`, `FieldList`: one test per state and per resolution kind (icon + text present, lock glyph when locked, "was: X", agent note, actions per state); risk order and collapsed verified → commit.
6. `InlineEditor`, `NotRequiredPicker`, `ConflictPanel`, `SuggestionCard` wired to `dispatchHuman` through a spy: `edit_start` once on first keystroke; Enter saves with unit; Esc dispatches nothing and returns focus; each validation message; picker reason; pick index; apply/dismiss focus target → commit.
7. `SourcePane` and documents: T4 test (a region containing `<img onerror>` renders as literal text, no `img` in the DOM); provenance link → tab + highlighted region; region click → row focused; reading marker after a `read` entry; `?quiet=1` hides `email:note` → commit. `DrawingSheet`: boxes at percentage positions from `package.json`; box click focuses the field → commit.
8. `ClarificationEditor`: covers limited to gaps, `send` payload, Discard without dispatch → commit.
9. `ConfirmFooter`, `ConfirmSummary`: blocker text and links; enabled ⇔ `canConfirm`; summary counts and lists from a fixture-driven state; timer from log timestamps → commit.
10. `ChangeLogDrawer`, `LiveRegion` (batching test with fake timers), `useKeyboardMap` → commit.
11. Boot wiring in `main.tsx` / `App.tsx`; `Play sample session` → replay; reduced-motion CSS; narrow sheet mode → commit.
12. Playwright specs (below); fix what they find → commit. Budgets check → final commit with the acceptance boxes ticked.

## Tests

Unit (vitest, jsdom per file): listed per step above. Every component test asserts through roles, names and text — no snapshots.

Playwright (`pnpm e2e`, against the production build):

- `review.spec.ts` — replay path: click `Play sample session`, wait for `confirmed`; along the way assert S2 (a proposed field shows provenance; clicking it highlights the region; verify collapses it), S3 (conflict panel with both candidates; pick), S4 (`Add unit` → editor → `in` → verified), S5 (missing row with searched docs and note), S6 (suggestion card on a locked field; apply), S7/B6 (strip count 6 → 7 → 6), S8 (editor opens; send; covered fields read "Asked customer"), S10 (summary counts equal the log; timer present); console has no errors or warnings.
- `tools.spec.ts` — stub `document.modelContext` with `page.addInitScript` (a `registerTool` that stores each tool by name on `window.__tools`), then drive `propose_field`, `report_conflict`, `report_missing`, `draft_clarification` through `execute` and assert the UI: strip flips `waiting` → `live`; rows arrive in risk order; a locked field returns `FIELD_LOCKED` and renders a card; no registered tool's `execute` with inputs containing "verified" leaves any field `verified` (T1 Playwright half).
- `narrow.spec.ts` — 390 and 820: one column, sample button is the primary, provenance link opens the sheet, `Close` returns focus, every target ≥ 44px, no horizontal scroll; 1024 and 1366: two panes, both lanes hold (every left edge equals `--page-margin` or `--page-margin` + 24).
- `a11y.spec.ts` — `prefers-reduced-motion: reduce` emulated: no running animations, static outline on provenance; the live region receives the batched "N fields proposed" and the one-by-one flags; keyboard run: `j` / `k` / `Enter` / `e` / `Esc` with focus visible at each step; zero requests to any origin other than the page's own (T2).

## Acceptance criteria

- [ ] Every screen in `docs/design/` is reproduced with tokens only; spacing uses the role table (an off-scale value or an edge on neither lane is a defect); no shadows, no alpha borders, no `font:` shorthand, tabular figures on numeric runs
- [ ] Every scenario element in S1–S10, B3–B5, B9–B11 renders and behaves as § UI rules; `?quiet=1` removes `email:note`
- [ ] All document, rationale, note and draft text reaches the DOM as text nodes (T4 unit test green; `dangerouslySetInnerHTML` absent from `src/`)
- [ ] `verified` styling is reachable only through `dispatchHuman`; no component accepts a value without `source_refs` for agent-attributed content
- [ ] Contrast test green for every ledger pair; every state carries icon + text; focus visible and returned per `DESIGN.md`; reduced-motion path tested
- [ ] `pnpm test`, `pnpm e2e`, `pnpm build`, `pnpm check:inline` green; JS ≤ 180 KB gzip, CSS ≤ 24 KB; no new runtime dependency; icons ship with `src/icons/LICENSE`
- [ ] `webmcp-tools.ts` unchanged; `reducer.ts` and the human/agent action unions unchanged; the dispatcher-split test still green
- [ ] Task file boxes ticked with evidence (test names, sizes) in the pull request description

## Out of scope

Replay controls (Play / Pause / Next call / Restart, step counter, "next:" line), Export / Import controls, the replay-time summary line ("recorded 1:48, this run 2:31") — P3. Real recorded session, evals, deployment headers — separate tasks.
