# P5 — Open your own package

**Status:** queued
**PR:** —
**Depends on:** P3 (branches from `main` after PR #5; merge after P4 so the drawing zoom applies to user drawings)

## Goal

A person can bring their own quote request instead of the bundled sample: paste the customer email and the specification as text, add the drawing as an image, and review it with the same seven tools, the same states and the same rules. Nothing leaves the browser. After this task the page is a tool, not a demonstration of one.

## Sources, in order of authority

1. `build-spec.md` § Tool contract (unchanged), § Field taxonomy, § Screens, § Size and performance budgets; `data/package.json` and `src/data/package.ts` (the package format the tools already read).
2. `DESIGN.md` — tokens, § Choice controls (native controls stay native: `<dialog>`, `<textarea>`, `<input type="file">`), control heights, the two lanes, § Copy grammar, § Focus and keyboard, motion.
3. `docs/scenarios.md` T2, T3, T4 (they hold for a user package with one stated change, § Trust below), B10, B11.
4. § UI rules below. The dialog is not drawn; the pull request carries screenshots at 1920 and 390 of its three states (empty, filled, validation).

## Scope — files

| Path | Responsibility |
|---|---|
| `src/data/package.ts` (modify) | the package becomes a small store: `getPackage()`, `setPackage(pkg)`, `subscribePackage()`; the bundled sample is the initial value; every helper (`documentIndex`, `findDocument`, `findSection`, `sectionRegions`, `resolvesSource`, `resolvesSearch`) reads the current package, so their callers (`src/state/read-results.ts`, `src/state/agent-validation.ts`) stay unchanged; `RfqPackage` gains `reference` and `customer` |
| `data/package.json` (modify) | `title` splits into `reference: "RFQ 26-0812"` and `customer: "Tarrowline Console Systems"` (data change, no content change) |
| `src/data/user-package.ts` (create) | `buildPackage({ reference, customer, email, spec, drawing })` → a package object in the same shape as `data/package.json` (§ Splitting); pure, tested without DOM |
| `src/data/package-storage.ts` (create) | saves the current user package to `localStorage` (`spotcheck.package.v1`) and restores it on load before the session restore; the drawing image as a data URL; a package hash in the session storage key so a saved session belongs to its package |
| `src/webmcp-tools.ts` (unchanged) | it does not touch the package: tool schemas are static and the read path is `read-results.ts` / `agent-validation.ts` through the `package.ts` helpers |
| `src/replay/persistence.ts` (modify) | the storage key comes from `sessionKey()` = `spotcheck.session.v1.{hash}` of the current package; `readSavedSession`, `saveNow` and `startPersistence` use it; `controller.ts` stays unchanged (it only calls those functions) |
| `src/main.tsx` (modify) | restore the user package (synchronous, from storage) before `startPersistence()`; tool registration at import time is fine because registration does not read the package |
| `src/components/OpenPackageDialog.tsx` (create) | native `<dialog>` with the form (§ Dialog) |
| `src/components/StatusStrip.tsx` (modify) | pre-live states gain the text button `Open your own package` next to `Play sample session` |
| `src/components/Header.tsx` (modify) | reference and customer from the current package |
| `src/components/DrawingSheet.tsx` (modify) | the title-area caption line renders only when the document has a `drawing:title_area` region (the sample); a user drawing has no boxes and the caption "No machine-readable text on this sheet · the agent reports drawing values as missing" |
| `src/App.tsx` (modify) | opens the dialog; on `Open`: `await controller.leave()` when a replay is attached (one replay owner, P3), then clear the old session key, `setPackage`, `replaceState(createInitialState())`, announce "Package opened: {reference}"; `?quiet=1` applies to the sample only |
| `DESIGN.md` § Interaction states (modify) | one line: a modal dialog owns a local primary (large) while it is open, like an inline editor owns a compact one |
| `src/styles/components.css` (modify) | dialog, form, drop zone |
| tests beside each module; `e2e/own-package.spec.ts` (create) | § Tests |

No new dependency. `reducer.ts`, the action unions, the tool descriptions and schemas unchanged.

## UI rules (normative)

### Entry point

- In `no-api` and `waiting`, the strip's action line gains a text button `Open your own package` after `Play sample session` (same row, `--space-2` apart; on narrow it takes the next line, full width, 44px). In `live` and `confirmed` it lives in the expanded change-log header beside `Play sample session` (opening a package during a live session is allowed; the dialog warns that the current review is discarded, § Dialog).
- After a user package is open, the same button reads `Open another package`, and the dialog offers `Use the sample package` as a text button.

### Dialog

A native `<dialog>` (modal; `Esc` closes; focus trapped by the element; focus returns to the button that opened it), width `min(720px, 100% - 2 * --page-margin)`, on narrow a full-height sheet with the same content. Title "Your package" (`--text-xl`). Fields, in order, each with a visible label above (md, `--ink-secondary`) and a hint line under it in sm:

1. `Reference` — single-line input, required, e.g. "RFQ 26-0812"; hint "Shown in the header and used as the session name".
2. `Customer` — single-line input, optional; hint "Company name only. Contact details are not needed".
3. `Customer email` — `<textarea>`, required, hint "Paste the text. Blank lines separate paragraphs; the first line is the subject".
4. `Specification` — `<textarea>`, required, hint "Paste the text. Numbered or capitalised lines become section titles".
5. `Drawing` — `<input type="file" accept="image/png,image/jpeg,image/webp">` fronted by a secondary compact button `Choose image` and the chosen file's name; optional; hint "PNG, JPEG or WebP, up to 4 MB. The agent cannot read text from the image; it will report drawing values as missing".
6. A line in `--ink-secondary` with the lock icon: "Everything stays in this browser. Your agent reads these documents through the page's tools, one section at a time, and every read is logged" — the honest version of T2/T3 for user content.
7. Actions: `Open package` (the dialog's local primary, large, per the DESIGN.md line this task adds) · `Cancel` (text) · `Use the sample package` (text, only while a user package is open).

Validation on `Open package`: reference empty → "Enter a reference"; email or spec empty → "Paste the {document}"; email or spec over 40,000 characters → "The {document} is longer than 40,000 characters; paste the relevant part"; image over 4 MB or wrong type → "Choose a PNG, JPEG or WebP under 4 MB". Errors per field in `--state-conflict` with the conflict icon and `aria-describedby`; the first invalid field takes focus.

When a session is in progress (any log entry) the dialog opens with a line above the actions: "Opening a package starts a new review; the current one is discarded" — no second confirmation step.

### Splitting (`buildPackage`)

Deterministic, no model:

- **Email:** the first non-empty line is the subject → region `email:subject`; the rest splits on blank lines into paragraphs → `email:p1` … `email:pN`; one section `body`. A paragraph longer than 1,200 characters splits at sentence ends into `email:p3`, `email:p3b`, …
- **Specification:** lines matching `^\d+(\.\d+)*[.)]?\s+\S` or an ALL-CAPS line of 3–80 characters start a section; text before the first heading is section `title` with region `spec:title`. Sections are `s1` … `sN` in order; each section's paragraphs (blank-line separated) become `spec:s3.1` …; a section with no body still exists with one region carrying its heading. Same 1,200-character split as the email.
- **Drawing:** one document `drawing` with sections `overall` and `detail`, both with zero regions, `image` = the data URL, `sheet` = "1 of 1"; when no image was chosen the document is omitted and `list_rfq_documents` lists two documents.
- Document titles: "Customer email", "Specification", "Drawing sheet 1". Region ids are the only ids the agent sees; the person sees paragraph and section numbers in the provenance links as today.
- Every `read_document` result must stay under 1,500 characters: the splitter guarantees ≤ 1,200 characters of text per region and the tool returns one region group per call as today; a unit test feeds a 40,000-character spec and asserts every section result under the cap.

### Trust

- T2 holds: no network request, no third-party origin; the image is a data URL in the page.
- T3 changes for user content: the sample package contains no contact data by construction; a user package may. The dialog says so (§ Dialog item 6) and the `Customer` field hint asks for a company name only. No redaction is attempted (a false sense of safety is worse than a true statement).
- T4 holds: every pasted string reaches the DOM as a text node; the splitter never interprets markup; a region containing `<img onerror>` renders literally (existing test, extended with a user package).
- The injection line of the sample is not part of user packages; `?quiet=1` is ignored for them.

### Persistence

- The user package persists in `localStorage` under `spotcheck.package.v1` (JSON, image as data URL); the session key becomes `spotcheck.session.v1.{hash}` where `{hash}` is a stable hash of the package's region texts, so a saved sample session and a saved user session do not mix. Opening a package clears the previous session key.
- On load: the user package is restored before the session (`main.tsx`); tools register at import time as today, which is safe because registration reads no package data and every call resolves documents through the store.
- `Use the sample package` restores the bundled package, clears the user package and its session.

### After opening

- Header shows `reference · customer` (or the reference alone) from the current package; the sample shows what it shows today.
- The strip returns to its pre-live state (`waiting` or `no-api`) with the orientation line; the field pane shows eleven empty rows; the source pane shows the Email tab with the pasted text; the Drawing tab shows the image (with P4's zoom) and the caption from § Scope, or is absent when no image was given.
- The live region announces "Package opened: {reference}".

## Order of work (test first; one commit per green step, subjects `P5 <area>: …`)

1. `user-package.ts` with tests: email subject and paragraphs; spec headings by number and by caps; text before the first heading; long paragraph split; region ids; size caps; a 40,000-character spec under the tool cap → commit.
2. `package.ts` store with tests; tools read the current package (unit: `list_rfq_documents` and `read_document` over a built package; `propose_field` with a user region id accepted, with a sample id rejected once the sample is replaced) → commit.
3. `package-storage.ts` with tests (save, restore, hash-keyed session, clear on open, `Use the sample package`) → commit.
4. `OpenPackageDialog.tsx`: tests for labels, hints, required validation, size validation, focus to the first invalid field, `Esc`, focus return; the in-progress warning line → commit.
5. Strip and log-header entry points; `Header`; `DrawingSheet` without boxes; `App` wiring with the announcement → commit.
6. e2e `own-package.spec.ts` (below); fix what it finds → commit. Screenshots, budgets, acceptance boxes → final commit.

## Tests

Playwright `e2e/own-package.spec.ts` (production build, stubbed `modelContext` from `e2e/helpers.ts`):

- Open the dialog from the strip; paste a two-paragraph email and a spec with three numbered sections; attach a small PNG (`setInputFiles`); `Open package` → header shows the reference; eleven empty rows; the Email tab shows the pasted paragraphs as text; `getTools()` still lists 6 tools.
- `list_rfq_documents` returns three documents with the derived sections; `read_document` for `spec`/`s2` returns the pasted paragraph as `spec:s2.1`; `propose_field` for `part_name` with `source_refs: ["spec:s1.1"]` lands in `needs_review` with a working provenance link; `report_missing` for `drawing_number` with `searched: ["drawing:overall"]` accepted.
- Drawing tab: the image renders, no overlay boxes, the caption; at `2×` (after P4) the panel scrolls.
- Reload → the package and the two proposed fields are back; `Play sample session` → the sample runs and, on `Start over`, the user package and its session are back (the P3 persistence scenario over a user package).
- `Use the sample package` → sample header, sample rows, sample session key.
- Validation: empty reference and a 5 MB file → both messages, focus on the reference.
- Injection: a pasted email containing `<img onerror=alert(1)>` renders literally; console clean.
- 390: the dialog is a full-height sheet; every control 44px; no horizontal scroll.

## Acceptance criteria

- [ ] A person can open their own email + spec (+ drawing image) and review it with the same tools, states and rules; the sample stays one click away
- [ ] Splitting rules per § Splitting, every tool result under 1,500 characters for a 40,000-character document
- [ ] Dialog per § Dialog at 1920 and 390 (screenshots in the pull request); native controls; validation and focus rules
- [ ] Persistence per § Persistence: package and session survive a reload; sample and user sessions never mix
- [ ] T2 and T4 green for user content; the T3 statement visible in the dialog
- [ ] `pnpm test`, `pnpm e2e`, `pnpm build`, `pnpm check:inline` green; JS ≤ 180 KB gzip, CSS ≤ 28 KB; no new dependency
- [ ] `webmcp-tools.ts` (descriptions, schemas, execute), `reducer.ts` and the action unions unchanged
- [ ] Task file boxes ticked with evidence in the pull request description

## Out of scope

PDF parsing, OCR of drawings, overlay boxes on user drawings, multiple drawings, sharing a package between browsers, any server.
