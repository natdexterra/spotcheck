# build-spec.md

The engineering contract for Spotcheck. Conflicts resolve in the order set by `AGENTS.md`: this file → `DESIGN.md` → `docs/scenarios.md` → `tasks/`. Scenario ids (S/B/T/O) refer to `docs/scenarios.md`.

## Stack

React 18 + TypeScript + Vite, static SPA, pnpm. React renders only: the reducer is a pure module (`src/state/reducer.ts`, no React imports) behind a small external store exposing `dispatchAgent` and `dispatchHuman`; components subscribe via `useSyncExternalStore`. All tools live in `src/webmcp-tools.ts` and import `dispatchAgent` and selectors only — nothing from the human action set (T1). Plain CSS custom properties generated from `DESIGN.md`. No router, no server code, no third-party origins.

## Tool contract

Seven tools, registered from `src/webmcp-tools.ts` with the literal form `document.modelContext.registerTool({...})`. Six register on load; `draft_clarification` is dynamic. Feature detection: `typeof document.modelContext?.registerTool === "function"`. Unregistering only via `AbortSignal`; never abort while a call is in flight. Budgets, enforced by unit test: every serialized result < 1,500 characters (fixture-driven, including `read_document` of every section — if `drawing:detail` brushes the limit with JSON overhead, split the section); descriptions ≤ 500; parameter descriptions ≤ 150; names ≤ 30.

Global result rules:

- **Null and false members are omitted from every result.** The drawing extras (`sheet`, `units_note`, `material_note`) appear only when non-null: absence is the agent's inference, never a spelled-out hint.
- **Rejections are results, not exceptions**: `{ ok: false, code, message, ... }`, positive-language messages that describe the fix.
- **Validation is strict in code, loose in schema.**

### `list_rfq_documents` — read-only

> Lists the documents in the RFQ package with their section index. Call once at the start to learn what can be read; use the section ids with read_document.

- Input: none. Annotations: `readOnlyHint: true`.
- Result: `{ documents: [{ id, type, title, sections: [{ id, title }] }] }`.
- Document and section titles are **app-authored constants** ("Customer email", "Specification", "Drawing sheet 1", the app's own section labels) — never text lifted from the package. That is what keeps this tool free of `untrustedContentHint`; if a title ever quotes the documents, the hint must be added.

### `read_document` — read-only, untrusted content

> Reads one section of one document and returns its text as regions with stable ids. Use those region ids as source_refs when proposing values. One section per call; output is capped, so read the sections you need.

- Input: `{ doc_id, section_id }`.
  - `doc_id` (≤150): "Document id from list_rfq_documents: email, spec or drawing."
  - `section_id`: "Section id from that document's index, e.g. s3 or overall."
- Annotations: `readOnlyHint: true`, `untrustedContentHint: true`.
- Result: `{ doc_id, section_id, regions: [{ id, text }] }` (+ drawing extras when non-null). Every read appends to the visible read log (T3).
- Errors: `UNKNOWN_DOCUMENT`, `UNKNOWN_SECTION`.

### `propose_field` — write

> Proposes a value for one quote-request field, with the source regions it came from. The field enters needs_review for the estimator to check. A field the estimator has already acted on keeps its value; your proposal is shown to them as a suggestion instead.

- Input: `{ field_id, value, unit?, source_refs, rationale? }`.
  - `field_id`: "One of the 11 field ids in the taxonomy."
  - `value`: "The proposed value, as it should appear in the quote request."
  - `unit`: "Unit for the unit-bearing field (in or mm). Omit if the sources state none."
  - `source_refs`: "Region or section ids the value comes from. At least one is required."
  - `rationale`: "One sentence on why this value; the estimator reads it."
- Result: `{ ok: true, field_id, state: "needs_review", value, unit, revised: true? }`.
- A proposal without a unit on a unit-bearing field is accepted; the app, not the agent, renders "no unit given" and blocks verify until a unit is added (S4).

### `report_conflict` — write

> Reports that the sources disagree about a field. Include every candidate with its value and sources — the estimator resolves the conflict; you cannot. A candidate may record an absence ("none stated") with the section where the value should have been.

- Input: `{ field_id, candidates: [{ value, unit?, source_refs, note? }, ...], note? }`. Code enforces ≥ 2 candidates and ≥ 1 valid `source_ref` per candidate; the schema stays loose.
- Result: `{ ok: true, field_id, state: "conflict", candidates: n }`.
- No silent merging: one new candidate on a field holding a proposal returns `SCHEMA` naming the earlier material ("include every candidate; the earlier proposal was 800 (spec:s1.1)").

### `report_missing` — write

> Reports that a field's value is absent after a real search, naming where you looked. Use this instead of guessing; the estimator sees the searched places and decides what to do.

- Input: `{ field_id, searched: [doc or section id, ...], note? }`.
- Result: `{ ok: true, field_id, state: "missing" }`.

### `get_review_state` — read-only, untrusted content

> Returns the whole review: every field with its state, value and lock, which fields are still unverified, and which are open gaps. Call it to plan your next step or to answer questions about the review.

- Input: none. Annotations: `readOnlyHint: true`, `untrustedContentHint: true` (values originate in customer documents).
- Result: `{ confirmed, fields: [{ id, state, value, unit, locked, suggestion_pending, resolution }], gaps: [field_id, ...], unverified: [field_id, ...] }` — null/false omitted, values cut to 40 characters with an ellipsis. There is no session-mode member: live and replay are indistinguishable by design.

### `draft_clarification` — write, dynamic

> Opens a clarification-email draft for the estimator, with your subject, body and the gap fields it covers. The estimator edits and sends it; the covered fields are then marked as asked. Available while open gaps exist.

- Registered while `gaps.length > 0 && !confirmed`; unregistered through its `AbortSignal` when the set empties, with the abort deferred while a call is in flight (S7, B6). The UI listens to `toolchange` for the roster.
- Input: `{ subject, body, covers: [field_id, ...] }`.
- `covers` validation: an unknown id → `UNKNOWN_FIELD`; a known field that is not a current gap is dropped. The result echoes the accepted subset — that is why it echoes at all: `{ ok: true, opened: true, covers }`. The body is never echoed back.

### Error codes

Precedence of rejections: `SESSION_CONFIRMED` → `FIELD_LOCKED` → `FIELD_IN_CONFLICT` → input errors. **Input validation still runs first internally**: a rejected write records a suggestion or note only when the payload would otherwise be accepted (known field, schema-valid, ≥ 1 valid source_ref). An unprovenanced proposal must never reach the suggestion card, locked field or not — the card's whole defense is its source link.

| Code | Carries | When |
|---|---|---|
| `FIELD_LOCKED` | `current: { value, unit, state, resolution }`, `suggestion_recorded` | any write on a locked field; `suggestion_recorded: false` when the value equals the current one (logged as "agent independently agrees") |
| `FIELD_IN_CONFLICT` | candidates' values and refs (never notes) | `propose_field` / `report_missing` on an unlocked `conflict` field |
| `SESSION_CONFIRMED` | — | any write after confirm |
| `UNKNOWN_FIELD` / `UNKNOWN_DOCUMENT` / `UNKNOWN_SECTION` | — | bad ids |
| `INVALID_SOURCE_REF` / `NO_SOURCE_REF` | offending ref | refs that do not resolve / missing provenance |
| `SCHEMA` | offending path, earlier material where useful | shape violations, single-candidate conflicts |

## Field taxonomy

Eleven fields, fixed ids. `overall_dimensions` is the only unit-bearing field (`unit ∈ {in, mm}`); all values are strings.

| id | Label | Notes |
|---|---|---|
| `customer_rfq_ref` | Customer RFQ ref | |
| `part_name` | Part | |
| `quantity` | Quantity | integer text |
| `material` | Material | |
| `stock_thickness` | Stock thickness | string; three thicknesses for three pieces |
| `overall_dimensions` | Overall dimensions | unit-bearing |
| `general_tolerance` | General tolerance | |
| `surface_finish` | Surface finish | |
| `drawing_number` | Drawing number | |
| `drawing_revision` | Drawing revision | |
| `delivery` | Delivery | O1 plausibility note is app-side |

## State machine

States: `empty | needs_review | conflict | missing | verified`; `verified` is reachable only through `dispatchHuman`. Field record, transitions matrix, lock semantics, resolution kinds, gap set, confirm rules, change-log events and the twelve invariants are implemented exactly as specified below; each invariant is a unit test.

```ts
type FieldState = 'empty' | 'needs_review' | 'conflict' | 'missing' | 'verified';

interface Field {
  id: FieldId;
  state: FieldState;
  value: string | null;
  unit?: string | null;              // unit-bearing fields only
  locked: boolean;                   // first human action incl. first keystroke; never released
  proposal?: Proposal;               // superseded, never removed
  candidates?: Candidate[];
  searched?: Searched;
  revised?: { was: string | null; at: number };
  suggestion?: Suggestion;           // one pending; replacement is logged
  ask_customer?: boolean;
  resolution?: Resolution;           // kind: verified | edited | entered | picked | dismissed | applied | asked_customer
}
```

- Agent dispatcher action union: `read | propose | report_conflict | report_missing | draft` — nothing else. Human: `verify | edit | edit_start | enter | pick | dismiss | apply | dismiss_suggestion | ask_customer | send | reopen | confirm`. `get_review_state` is a selector.
- Agent matrix: propose/report on unlocked fields per the five-state table; the agent may lower its own `missing` by proposing, may never lower a `conflict` (only widen it via `report_conflict`); locked → `FIELD_LOCKED` (+ suggestion for valid differing proposals, log-line note for report tools); confirmed → `SESSION_CONFIRMED`.
- Human actions: edit saves as `verified` (Enter = save + verify); dismiss requires a reason (three presets + free text); apply/dismiss-suggestion keep the lock; send resolves covered fields to `verified/asked_customer` and logs one entry with the draft-vs-sent diff; reopen restores the derived agent state, keeps value and lock; confirm requires all 11 `verified`, auto-dismisses pending suggestions (logged), stops the timer (first write-tool call → confirm).
- Invariants (unit tests): 1 no agent action produces `verified`; 2 no agent action changes a locked field; 3 `locked` monotonic; 4 `conflict` exits only by human action; 5 `verified` ⇒ `locked`; 6 agent payloads superseded never removed; 7 `draft_clarification` registered ⇔ gaps ∧ ¬confirmed (in-flight settled); 8 confirm enabled ⇔ all verified; 9 every action emits exactly one log entry with an actor; 10 after confirm no write changes anything, reads still answer; 11 every accepted proposal/candidate carries ≥ 1 source_ref; 12 unit-bearing field never `verified` with null unit unless dismissed/asked_customer.

## Fixture and replay

`data/sample-session.json`: `{ recorded_at, steps: [{ actor: "agent" | "estimator", at: number, call?: { tool, input }, action?: { type, ...payload } }] }`. Replay feeds the same reducer: agent steps go through the tool layer (a replayed `FIELD_LOCKED` is a real rejection), estimator steps through `dispatchHuman`. Cadence 900ms agent / 1500ms before estimator steps; viewer may act while paused; a fixture estimator step on a field the viewer already handled is skipped and logged. Export serializes the change log in the same format; export → import → identical final state is B8's unit test. Session persistence (P1): the log to `localStorage`, replayed on load.

## Screens (user flow order)

1. **First load**: 11 empty rows ("— · Not extracted"), "0 of 11 verified", one-line how-it-works, Email tab open, strip as the single CTA (`waiting` with copyable prompt / `no-api` with primary sample button), empty log.
2. **Extraction**: reads mark the active tab and flash the section; fields animate in; strip flips to `live`.
3. **Triage** (main): risk order conflicts → missing → to review → verified collapsed; conflict panel with candidates; suggestion card on locked fields; provenance links open the source both ways — including the **Drawing tab**: WebP sheet + normalized overlay boxes; a box click focuses its field; `drawing:title_area` is the clickable blank corner.
4. **Clarification editor**: over the source pane; subject, agent's body, covers checkboxes limited to current gaps, mock Send, Discard.
5. **Confirm summary**: title with open-question count, review time, counts per resolution, edits/picks/dismissals/pending lists, full log, Export, Start over.
6. **After**: read-only fields, strip "Confirmed", write tools answer `SESSION_CONFIRMED`.

Breakpoints: two panes ≥ 1024px (layout ladder in `DESIGN.md`); one column below — source pane opens as a sheet; tested at 390 and 820 (B10).

## Component inventory

`Header` · `StatusStrip` (no-api / waiting / live / replay / confirmed; quiet summary line + expandable roster; announces tool changes) · `ReplayControls` · `FieldList` (risk sort, group headers, collapsed verified) · `FieldRow` (marker bar + dot badge variants per state/resolution; lock glyph) · `ConflictPanel` + `CandidateOption` · `SuggestionCard` · `InlineEditor` (edit_start locks on first keystroke; Esc closes, focus returns) · `ProvenanceLink` (dotted) / `JumpLink` (solid) · `ButtonPrimary` / `ButtonSecondary` / `TextButton` (classes per DESIGN.md Interaction states) · `SourcePane` (tabs, EmailDoc, SpecDoc, DrawingSheet + `OverlayBox`) · `ClarificationEditor` · `ConfirmFooter` (blocker jump links) · `ConfirmSummary` · `ChangeLogDrawer` (+ import input) · `LiveRegion` (one, polite; agent flags and human actions one by one, plain proposals batched) · icons as inline SVG components (`src/icons/`, MynaUI MIT + custom composites, license text alongside).

Keyboard (B9): `j`/`k` flagged-field navigation, `Enter` primary action, `e` editor, `n` not-required where allowed, `Esc` close; focus always visible and returned.

## Size and performance budgets

- JS ≤ 180 KB gzip total (React included); CSS ≤ 24 KB; no inline scripts (`default-src 'self'` holds).
- `data/drawing-sheet1.webp` ≤ 300 KB; fonts self-hosted woff2, preloaded, `Geist Fallback` metric-matched.
- Every tool result < 1,500 chars serialized — fixture-driven unit test.
- INP ≤ 200 ms during live extraction (the ADR's review trigger).
- Headers on the deployed origin: `Content-Security-Policy: default-src 'self'`, `Permissions-Policy: tools=(self)`, origin-trial token (T2).
