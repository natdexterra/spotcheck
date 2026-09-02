# P5 — Open your own package

**Status:** queued
**PR:** —
**Depends on:** P3 (merged), P4 and P3.1 — branch from `main` only after both have merged: P4 for the zoom on user drawings, P3.1 because both tasks touch `StatusStrip.tsx` and the editor-height line in DESIGN.md § Interaction states
**Amended:** 2026-09-02 after the design review of the first draft: the strip names both paths, the user drawing gets one whole-sheet region, the image is re-encoded before storage, the specification becomes optional, every end-to-end test declares the API state explicitly. Second amendment the same day after the contradiction pass: the sample replay switches the package itself (`controller.ts` in scope), `SourcePane.tsx` in scope for the tab set, the native-controls line goes into DESIGN.md, corrected citations.

## Goal

A person can bring their own quote request instead of the bundled sample: paste the customer email and the specification as text, add the drawing as an image, and review it with the same seven tools, the same states and the same rules. Nothing leaves the browser. After this task the page is a tool, not a demonstration of one.

## Sources, in order of authority

1. `build-spec.md` § Tool contract (unchanged), § Field taxonomy, § Screens, § Size and performance budgets; `data/package.json` and `src/data/package.ts` (the package format the tools already read).
2. `DESIGN.md` — tokens, § Choice controls (radios, checkboxes and the segmented control are the app's own drawing), control heights, the two lanes, § Copy grammar, § Focus and keyboard, motion. The rule for `<dialog>`, `<textarea>` and `<input type="file">` does not exist there yet; this task adds it (§ Scope, the DESIGN.md row) and follows it.
3. `docs/scenarios.md` T2, T3, T4 (they hold for a user package with one stated change, § Trust below), B10, B11.
4. § UI rules below. The dialog is not drawn; the pull request carries screenshots at 1920 and 390 of its three states (empty, filled, validation).
5. For the native `<dialog>` (open, close, `Esc`, focus return, backdrop, entry and exit without motion under `prefers-reduced-motion`): the Modern Web Guidance guides from the Chrome and Edge teams — run `npx -y modern-web-guidance@latest search "modal dialog"` and read the top guide plus `animate-to-from-top-layer`; follow them where `DESIGN.md` is silent, and `DESIGN.md` where it speaks.

## Scope — files

| Path | Responsibility |
|---|---|
| `src/data/package.ts` (modify) | the package becomes a small store: `getPackage()`, `setPackage(pkg)`, `subscribePackage()`; the bundled sample is the initial value and stays exported as `samplePackage` (the two other importers of today's `packageData`, `src/components/Header.tsx` and `src/webmcp-tools.test.ts`, are updated in the same commit); every helper (`documentIndex`, `findDocument`, `findSection`, `sectionRegions`, `resolvesSource`, `resolvesSearch`) reads the current package, so their callers (`src/state/read-results.ts`, `src/state/agent-validation.ts`) stay unchanged; `RfqPackage` gains `reference` and `customer` |
| `data/package.json` (modify) | `title` splits into `reference: "RFQ 26-0812"` and `customer: "Tarrowline Console Systems"` (data change, no content change) |
| `src/data/user-package.ts` (create) | `buildPackage({ reference, customer, email, spec, drawing })` → a package object in the same shape as `data/package.json` (§ Splitting); pure, tested without DOM |
| `src/data/prepare-drawing.ts` (create) | `prepareDrawing(file)` → the re-encoded data URL or a typed validation error (§ Image); canvas work isolated here |
| `e2e/helpers.ts` (modify) | `removeModelContext(page)` beside `installModelContext` (§ Tests) |
| `src/data/package-storage.ts` (create) | saves the current user package to `localStorage` (`spotcheck.package.v1`) and restores it on load before the session restore; the drawing image as a data URL; a package hash in the session storage key so a saved session belongs to its package |
| `src/webmcp-tools.ts` (unchanged) | it does not touch the package: tool schemas are static and the read path is `read-results.ts` / `agent-validation.ts` through the `package.ts` helpers |
| `src/replay/persistence.ts` (modify) | the storage key comes from `sessionKey()` = `spotcheck.session.v1.{hash}` of the current package; `readSavedSession`, `saveNow` and `startPersistence` use it |
| `src/replay/controller.ts` (modify) | `startSample` switches to the sample package before the replay attaches (the fixture's refs — `email:p3`, `spec:s2.6`, `drawing:width` … — exist only there), and the P3 leave sequence restores the package that was current before the replay together with the session snapshot (`importSession` → `setPackage(previous)` → `dispose` → `saveNow`), so `Start over` returns to the user package and its session. `startImported` runs the fixture over the current package: a fixture exported from another package fails at the tool validation (rejections in the log), which this task does not guard — noted in § Out of scope |
| `src/components/SourcePane.tsx` (modify) | the document tabs derive from the current package (today `DOCUMENT_TABS` is a constant of three): a tab exists only for a document the package holds; the Clarification tab is untouched; a provenance target whose document is absent is a no-op; narrow sheet the same |
| `src/main.tsx` (modify) | restore the user package (synchronous, from storage) before `startPersistence()`; tool registration at import time is fine because registration does not read the package |
| `src/components/OpenPackageDialog.tsx` (create) | native `<dialog>` with the form (§ Dialog) |
| `src/components/StatusStrip.tsx` (modify) | pre-live states gain the text button `Open your own package` next to `Play sample session` (§ Entry point, including the narrow `no-api` exception); the orientation line names the sample or the user package |
| `src/components/Header.tsx` (modify) | reference and customer from the current package |
| `src/components/DrawingSheet.tsx` (modify) | the title-area caption line renders only when the document has a `drawing:title_area` region (the sample); a user drawing has the single whole-sheet box of `drawing:sheet` (§ Splitting), shown under the same rule as the sample's boxes, and the caption "Image only · no text is read from this sheet" |
| `src/App.tsx` (modify) | opens the dialog; on `Open`: `await leave()` (from `src/replay/controller`, as `App.tsx` already imports it) when a replay is attached (one replay owner, P3), then clear the old session key, `setPackage`, `replaceState(createInitialState())`, announce "Package opened: {reference}"; `?quiet=1` applies to the sample only |
| `DESIGN.md` (modify) | § Interaction states, one line: a modal dialog owns a local primary (large) while it is open, in the same way an open inline editor owns one. § Choice controls, one line: `<dialog>`, `<textarea>` and `<input type="file">` stay native — styled only through tokens (font, color, border, radius, focus ring), no re-drawn replacement. § Color adds one token `--scrim` (`--ink` at 32% alpha via `color-mix`, on the dark ground only) for the dialog's `::backdrop`; no blur, per § No shadows |
| `src/styles/components.css` (modify) | dialog, form, drop zone |
| tests beside each module; `e2e/own-package.spec.ts` (create) | § Tests |

No new dependency. `reducer.ts`, the action unions, the tool descriptions and schemas unchanged.

## UI rules (normative)

### Entry point

- At the two-column widths, in `no-api` and `waiting`, the strip's action line gains a text button `Open your own package` after `Play sample session` (same row, `--space-2` apart). Below the one-column breakpoint (DESIGN.md): in `waiting` the button takes the next line, full width, 44px; in `no-api` it is **not in the strip** (no agent runs on those devices and the first load must stay light) and lives only in the change-log sheet header. In `live` and `confirmed` it lives in the expanded change-log header beside `Play sample session` at every width (opening a package during a live session is allowed; the dialog warns that the current review is discarded, § Dialog).
- The strip's orientation line (D18, `StatusStrip.tsx`) names both paths. With the sample: "This page holds a sample RFQ package: email, spec and drawing. Your agent fills the 11 quote-request fields through the page’s tools; you check each against its source and confirm." With a user package: "This page holds your package {reference}: {its documents, e.g. email and drawing}. Your agent fills the 11 quote-request fields through the page’s tools; you check each against its source and confirm." Both strings and the privacy line (§ Dialog item 6) pass `ai-text-detector` before the pull request, as every interface string does.
- After a user package is open, the same button reads `Open another package`, and the dialog offers `Use the sample package` as a text button.

### Dialog

A native `<dialog>` (modal; `Esc` closes; focus trapped by the element; focus returns to the button that opened it), width `min(720px, 100% - 2 * --page-margin)`, on narrow a full-height sheet with the same content. Title "Your package" (`--text-xl`). Fields, in order, each with a visible label above (md, `--ink-secondary`) and a hint line under it in sm:

1. `Reference` — single-line input, required, placeholder `e.g. {reference}` where `{reference}` is the sample's `reference` from `data/package.json` (a placeholder attribute, never a prefilled value); hint "Shown in the header and used as the session name".
2. `Customer` — single-line input, optional; hint "Company name only. Contact details are not needed".
3. `Customer email` — `<textarea>`, required, hint "Paste the text. Blank lines separate paragraphs; the first line is the subject".
4. `Specification` — `<textarea>`, optional when a drawing is attached (§ Validation), hint "Paste the text. Numbered or capitalised lines become section titles".
5. `Drawing` — `<input type="file" accept="image/png,image/jpeg,image/webp">` fronted by a secondary compact button `Choose image` and the chosen file's name; optional when a specification is pasted; hint "PNG, JPEG or WebP, up to 10 MB; a screenshot of a PDF page works. No text is read from the image: the agent reports what it cannot see as missing". The image is re-encoded before use (§ Image).
6. A line in `--ink-secondary` with the lock icon: "Nothing leaves this page on its own. Your agent receives what it reads through the page’s tools, one section at a time, and every read is logged" — the honest version of T2/T3 for user content. It must not claim that the data stays in the browser: what the agent reads reaches the agent's provider.
7. Actions: `Open package` (the dialog's local primary, large, per the § Interaction states line this task adds) · `Cancel` (text) · `Use the sample package` (text, only while a user package is open).

Validation on `Open package`: reference empty → "Enter a reference"; email empty → "Paste the customer email"; spec empty and no drawing → "Add the specification or a drawing" (under the Specification field); email or spec over 40,000 characters → "The {document} is longer than 40,000 characters; paste the relevant part"; file of another type (HEIC, PDF, SVG, …) → "Choose a PNG, JPEG or WebP. A screenshot of the PDF page works"; file over 10 MB → "Choose an image under 10 MB"; a file that does not decode → "This file could not be opened as an image". Errors per field in `--state-conflict` with the conflict icon and `aria-describedby`; the first invalid field takes focus. The page never decides whether the image is a drawing: the person sees it in the Drawing tab, and the agent's `report_missing` covers content that is not an RFQ.

When a session is in progress (any log entry) the dialog opens with a line above the actions: "Opening a package starts a new review; the current one is discarded" — no second confirmation step.

### Image (`prepareDrawing`)

Pure function over a `File`, tested with generated images: decode with `createImageBitmap` (failure → the validation error above); draw onto a canvas with the long side capped at the long side of the bundled sample sheet — the image file named by `drawing.image` in `data/package.json`, its natural size read from the decoded image at test time, never a literal in code (the size itself is stated in `tasks/P4-drawing-zoom.md` § Goal); export as WebP at quality 0.85, and when the browser returns another MIME prefix (older Safari) export as JPEG at the same quality; the resulting data URL is the drawing used by the package, the Drawing tab and storage, and the original file is discarded. Unit test: a generated 5,000 × 3,500 PNG over 8 MB becomes a data URL under 2 MB; a 300 × 200 image is not upscaled. Reason: `localStorage` holds about 5 MB per origin in Chrome and base64 adds a third, so the first draft's 4 MB original would have failed at `setItem` after the person pressed Open.

### Splitting (`buildPackage`)

Deterministic, no model:

- **Email:** the first non-empty line is the subject → region `email:subject`; the rest splits on blank lines into paragraphs → `email:p1` … `email:pN`; one section `body`. A paragraph longer than 1,200 characters splits at sentence ends into `email:p3`, `email:p3b`, …
- **Specification:** lines matching `^\d+(\.\d+)*[.)]?\s+\S` or an ALL-CAPS line of 3–80 characters start a section; text before the first heading is section `title` with region `spec:title`. Sections are `s1` … `sN` in order; each section's paragraphs (blank-line separated) become `spec:s3.1` …; a section with no body still exists with one region carrying its heading. Same 1,200-character split as the email.
- **Drawing:** one document `drawing` with sections `overall` and `detail`, `image` = the re-encoded data URL (§ Image), `sheet` = "1 of 1". Section `overall` has exactly one region `drawing:sheet` whose overlay box is the whole sheet (normalized 0,0 to 1,1) and whose text reads "Drawing sheet 1: image, no transcription. Values read from the image must be checked against the sheet."; section `detail` has zero regions. So an agent that can see the page may cite the sheet (`propose_field` with `source_refs: ["drawing:sheet"]`; the provenance link highlights the whole sheet), and an agent that cannot see it gets the text and reports the value missing. When no image was chosen the document is omitted and `list_rfq_documents` lists two documents; when no specification was pasted the `spec` document is omitted the same way.
- Document titles: "Customer email", "Specification", "Drawing sheet 1". Region ids are the only ids the agent sees; the person sees paragraph and section numbers in the provenance links as today.
- Every `read_document` result must stay under 1,500 characters: the splitter guarantees ≤ 1,200 characters of text per region and the tool returns one region group per call as today; a unit test feeds a 40,000-character spec and asserts every section result under the cap.

### Trust

- T2 holds: no network request, no third-party origin; the image is a data URL in the page.
- T3 changes for user content: the sample package contains no contact data by construction; a user package may. The dialog says so (§ Dialog item 6) and the `Customer` field hint asks for a company name only. No redaction is attempted (a false sense of safety is worse than a true statement), and the privacy line says where the data goes: nowhere by itself, to the agent through the tools.
- T4 holds: every pasted string reaches the DOM as a text node; the splitter never interprets markup; a region containing `<img onerror>` renders literally (existing test, extended with a user package).
- The injection line of the sample is not part of user packages; `?quiet=1` is ignored for them.

### Persistence

- The user package persists in `localStorage` under `spotcheck.package.v1` (JSON, image as data URL); the session key becomes `spotcheck.session.v1.{hash}` where `{hash}` is a stable hash of the package's region texts, so a saved sample session and a saved user session do not mix. Opening a package clears the previous session key.
- On load: the user package is restored before the session (`main.tsx`); tools register at import time as today, which is safe because registration reads no package data and every call resolves documents through the store.
- `Use the sample package` restores the bundled package, clears the user package and its session.
- The stored image is the re-encoded one (§ Image). If `localStorage.setItem` still throws (quota), the package stays open in memory for the visit, nothing is half-written (remove the key first), the live region announces "Package opened for this visit only: the browser has no room to keep it", and the strip's orientation line carries the same sentence until reload. Unit test with a `setItem` stub that throws.

### After opening

- Header shows `reference · customer` (or the reference alone) from the current package; the sample shows what it shows today.
- The strip returns to its pre-live state (`waiting` or `no-api`) with the user-package orientation line (§ Entry point); the field pane shows eleven empty rows; the source pane shows the Email tab with the pasted text; the Spec tab is absent when no specification was pasted; the Drawing tab shows the image (with P4's zoom), the whole-sheet box and the caption from § Scope, or is absent when no image was given.
- The live region announces "Package opened: {reference}".

## Order of work (test first; one commit per green step, subjects `P5 <area>: …`)

1. `user-package.ts` with tests: email subject and paragraphs; spec headings by number and by caps; text before the first heading; long paragraph split; region ids; the `drawing:sheet` region; a package without spec and a package without drawing; size caps; a 40,000-character spec under the tool cap → commit.
1a. `prepare-drawing.ts` with tests (§ Image) → commit.
2. `package.ts` store with tests; `controller.ts` package switch and restore with tests (sample replay over a user package: no rejection; leave restores the package); tools read the current package (unit: `list_rfq_documents` and `read_document` over a built package; `propose_field` with a user region id accepted, with a sample id rejected once the sample is replaced) → commit.
3. `package-storage.ts` with tests (save, restore, hash-keyed session, clear on open, `Use the sample package`, quota failure) → commit.
4. `OpenPackageDialog.tsx`: tests for labels, hints, required validation, size validation, focus to the first invalid field, `Esc`, focus return; the in-progress warning line → commit.
5. `removeModelContext` helper and its use in every existing `no-api` test; strip and log-header entry points incl. the narrow `no-api` exception; orientation strings; `Header`; `SourcePane` tab set from the package; `DrawingSheet` with the whole-sheet box; `App` wiring with the announcement → commit.
6. e2e `own-package.spec.ts` (below); fix what it finds → commit. Screenshots, budgets, acceptance boxes → final commit.

## Tests

**API presence is declared, never inherited.** Playwright's Chromium (151 at the time of writing) honours the production `Origin-Trial` header and exposes `document.modelContext` on the deployed site, while a local build has no header and no API; a future Chromium may ship the API by default. So every test that asserts `no-api` installs `removeModelContext(page)` (init script: `Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })`) and every test that asserts `waiting` or `live` installs `installModelContext(page)`; no test relies on the browser's default. The existing `no-api` tests in `layout.spec.ts` and `narrow.spec.ts` get the helper in this task.

Playwright `e2e/own-package.spec.ts` (production build, API state declared per test as above):

- Open the dialog from the strip; paste a two-paragraph email and a spec with three numbered sections; attach a small PNG (`setInputFiles`); `Open package` → header shows the reference; the orientation line names the package; eleven empty rows; the Email tab shows the pasted paragraphs as text; `getTools()` still lists 6 tools.
- Email plus drawing, no spec → opens; `list_rfq_documents` lists two documents; `read_document` for `drawing`/`overall` returns `drawing:sheet`; `propose_field` for `overall_dimensions` with `source_refs: ["drawing:sheet"]` lands in `needs_review` and its provenance link highlights the whole sheet.
- An image over 8 MB is accepted and the stored data URL is under 2 MB; a `.heic` file shows the type message; with `setItem` stubbed to throw, the package opens and the announcement says it is kept for this visit only.
- `list_rfq_documents` returns three documents with the derived sections; `read_document` for `spec`/`s2` returns the pasted paragraph as `spec:s2.1`; `propose_field` for `part_name` with `source_refs: ["spec:s1.1"]` lands in `needs_review` with a working provenance link; `report_missing` for `drawing_number` with `searched: ["drawing:overall"]` accepted.
- Drawing tab: the image renders with the whole-sheet box and the caption; at `2×` (after P4) the sheet scrolls inside its wrapper per `tasks/P4-drawing-zoom.md` § UI rules.
- Tab set: email plus drawing → tabs Email, Drawing, Clarification (no Spec); email plus spec → no Drawing tab; the sample → all three.
- Reload → the package and the two proposed fields are back; `Play sample session` → the header and rows switch to the sample and the replay runs to its end without a rejection in the log (the package switch in `controller.ts`); on `Start over`, the user package, its header and its two proposed fields are back (the P3 persistence scenario over a user package).
- `Use the sample package` → sample header, sample rows, sample session key.
- Validation: empty reference and a 12 MB file → both messages, focus on the reference; email only, no spec and no drawing → the spec message.
- Injection: a pasted email containing `<img onerror=alert(1)>` renders literally; console clean.
- 390: the dialog is a full-height sheet; every control 44px; no horizontal scroll. In `no-api` the strip has no own-package button and the change-log sheet header has one; in `waiting` the strip button is full width, 44px.

## Acceptance criteria

- [ ] A person can open their own email + spec (+ drawing image) and review it with the same tools, states and rules; the sample stays one click away
- [ ] Splitting rules per § Splitting, every tool result under 1,500 characters for a 40,000-character document
- [ ] Dialog per § Dialog at 1920 and 390 (screenshots in the pull request); native controls; validation and focus rules
- [ ] Image pipeline per § Image; a storage failure never reaches the person as an error
- [ ] Persistence per § Persistence: package and session survive a reload; sample and user sessions never mix
- [ ] Every end-to-end test declares the API state through the helpers, including the existing `no-api` tests
- [ ] The two orientation strings and the privacy line passed `ai-text-detector`
- [ ] T2 and T4 green for user content; the T3 statement visible in the dialog
- [ ] `pnpm test`, `pnpm e2e`, `pnpm build`, `pnpm check:inline` green; JS ≤ 180 KB gzip, CSS size reported (no byte gate); no new dependency
- [ ] `webmcp-tools.ts` (descriptions, schemas, execute), `reducer.ts` and the action unions unchanged
- [ ] Task file boxes ticked with evidence in the pull request description

## Out of scope

PDF parsing, OCR of drawings, overlay boxes inside a user drawing (only the whole-sheet box exists), a check that the image is a drawing, multiple drawings, sharing a package between browsers, any server, a guard for importing a session file over a package it was not exported from (the tool validation rejects its refs in the log).
