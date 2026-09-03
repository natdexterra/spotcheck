# P4 — Drawing zoom

**Status:** done — 2026-09-02
**PR:** [#6](https://github.com/natdexterra/spotcheck/pull/6)
**Depends on:** P2 (branches from `main`; independent of P3 — may run in parallel on its own branch)

## Goal

The drawing sheet is a 2200 × 1540 image shown at pane width, where dimension text is too small to read. The Drawing tab gets a `1×` | `2×` zoom control; at `2×` the sheet renders at twice the pane width and the pane scrolls both ways; the overlay boxes follow the image (they are percentages already); provenance links still bring the right box into view. No wheel or pinch zoom, no animation.

## Sources, in order of authority

1. `build-spec.md` § Screens (source pane, Drawing tab), § Size and performance budgets.
2. `DESIGN.md` — § Choice controls (the segmented control is the `in` | `mm` component: a radio group), spacing roles, the document gutter, hit targets, motion, "no horizontal page scroll at 320px — anything wide scrolls inside its own wrapper".
3. `docs/design/17-drawing-zoom.png` — the toolbar and the sheet at `1×` and `2×` (1920) and at `2×` inside the 390 source sheet; `06` for the tab at `1×` as shipped. The export prints a region id and a file name in captions and headers; the rule wins (no ids in the source pane, the sheet header shows the document title). Screenshots at 1920 and 390 in the pull request.
4. `docs/scenarios.md` — S4 (overall dimensions from the drawing, provenance into the sheet), B10, B11.

## Scope — files

| Path | Responsibility |
|---|---|
| `src/components/DrawingSheet.tsx` (modify) | the toolbar with the zoom control; `zoom` in component state (`1` or `2`), a `drawing-sheet--zoom-2` modifier on the figure; scrolls the active box into view after a zoom change or a new `highlightedRef` |
| `src/components/Choice.tsx` (reuse) | the segmented radio group, unchanged |
| `src/components/SourcePane.tsx` (modify) | the Drawing tab panel becomes a non-scrolling flex column so the sheet's scroll wrapper can take the remaining height; nothing else |
| `src/styles/components.css` (modify) | toolbar, the `2×` image width, the inner scroll wrapper |
| `src/components/DrawingSheet.test.tsx` (create), `e2e/zoom.spec.ts` (create) | § Tests |

No new dependency.

## UI rules (normative)

- **Toolbar.** A row above the sheet, on the document lane, `--space-3` under the tab row: the micro-label "Zoom" and the segmented control with two options labelled `1×` and `2×` (the real multiplication sign, U+00D7; `aria-label` "Zoom 1x" / "Zoom 2x" for speech), at the lane's right edge; the row's left stands empty — the sheet count was removed (second ruling below). Default `1×`. The choice is UI state for the session (never the reducer, never storage). The figcaption keeps its first line ("a revision letter would live here; there is none") and the clickable-regions note.
- **`1×`.** As today: the image at the wrapper's width, intrinsic aspect ratio.
- **`2×`.** The image wrap is `width: 200%` of the sheet region's content width. The **sheet region** is an inner scroll wrapper (`drawing-sheet__scroll`) around the image wrap, between the toolbar and the caption: it scrolls in both directions inside itself (`overflow: auto`; the scroll region is this wrapper — not the panel, not the page; its scrollbars sit at the wrapper's edges, which at `2×` run to the panel edges so 200% is exactly two panel widths, as export 17 draws). The toolbar and the caption stay on the document lane and never pan with the sheet. The wrapper takes the panel height left by the toolbar and caption (`flex: 1; min-height: 0` in a column), so the Drawing tab panel itself does not scroll at either zoom; at `1×` the wrapper shows the whole sheet when it fits and scrolls vertically when it does not. Overlay boxes are positioned in percentages of the wrap and scale with it; the dashed edge stays 1px (a border, not a scaled stroke). Font size of the caption and toolbar does not change with zoom.
- **Provenance into the drawing at `2×`.** A provenance link, or any other change of `highlightedRef`, scrolls the box into view inside the scroll wrapper (`scrollIntoView({ block: 'center', inline: 'center' })`, `behavior: 'auto'` — no smooth scrolling here, the flash is the motion). Switching zoom while a box is highlighted keeps it in view the same way. A region click runs the other direction and does not highlight: it focuses the field that region sources, and the sheet stays where it is. Under `prefers-reduced-motion` nothing changes: the zoom is instant either way, and no transition is applied to width or transform.
- **No wheel zoom, no pinch.** `wheel` and `gesture` events are not handled; ctrl + wheel is left to the browser (page zoom). The control is the only way to change zoom.
- **Keyboard.** The segmented control is a radio group: arrow keys move between `1×` and `2×`, focus ring per DESIGN.md. At `2×` the sheet is scrollable by keyboard because the scroll wrapper is the focused scroll container (`role="group"`, `tabindex="0"` and the name "Drawing sheet, scrollable" on the wrapper — a name needs a role to be exposed; the Drawing tab panel carries none of the three — it is not a scroll container).
- **Narrow (< 1024px).** Same toolbar in the source sheet; the control's targets are 44px; at `2×` the sheet body scrolls horizontally inside its own wrapper, so the page never scrolls horizontally (WCAG 1.4.10 holds at 320px).
- **Reading marker.** The `--reading` outline on the image wrap follows the wrap at either zoom.

## Order of work (test first; one commit per green step, subjects `P4 <area>: …`)

1. `DrawingSheet.test.tsx`: the toolbar renders a radio group named "Zoom" with `1×` checked; choosing `2×` adds `drawing-sheet--zoom-2`; box percentages are unchanged by zoom; `scrollIntoView` (spied) is called with `block: 'center', inline: 'center'` on the active box after a zoom change and after a new `highlightedRef` → implement → commit.
2. CSS: toolbar, `2×` width, the inner scroll wrapper; the layout guard still green → commit.
3. `e2e/zoom.spec.ts` (below); fix what it finds → commit. Screenshots at 1920 and 390 at `2×` with a highlighted box; acceptance boxes → final commit.

## Tests

Playwright `e2e/zoom.spec.ts` (production build):

- 1920: open the Drawing tab; `2×` → the image wrap's `scrollWidth` is about twice the panel's `clientWidth` (± 2px); `document.documentElement.scrollWidth` equals `clientWidth` (no page scroll); the scroll wrapper is the scrolling element (its `scrollWidth` > `clientWidth`), the panel is not (`scrollWidth` equals `clientWidth`); the toolbar's and the caption's bounding rects do not move when the wrapper is scrolled by 200px in each axis.
- Provenance: from a replayed session (`Play sample session`, advance until `overall_dimensions` shows), click its `drawing` provenance link at `2×` → the active box's bounding rect lies inside the scroll wrapper's bounding rect.
- Wheel: dispatch a `wheel` event with `ctrlKey` on the image → the radio group still reads `1×`.
- Keyboard: focus the radio group, press ArrowRight → `2×` checked; Tab → the scroll wrapper takes focus; ArrowDown scrolls it (`scrollTop` > 0).
- 390: the source sheet at `2×` → no horizontal page scroll; the control's targets ≥ 44px.
- `prefers-reduced-motion: reduce` emulated: switching zoom produces no running animation or transition on the wrap.
- Console clean throughout.

## Acceptance criteria

- [x] Toolbar per § UI rules at 1920 and 390 (screenshots in the pull request); `×` is U+00D7; default `1×`; no sheet count anywhere — `DrawingSheet.test.tsx` "the toolbar carries a Zoom radio group that opens on 1×, and no sheet count"; screenshots `docs/qa/p4/drawing-zoom-1x-1920.png` and `-1x-390.png` (at rest) and `-2x-…` (mid-pan)
- [x] `2×` doubles the sheet inside its own scroll wrapper, toolbar and caption fixed; page never scrolls horizontally; overlay boxes and the reading outline follow the image — `zoom.spec.ts` "2× doubles the sheet inside its own scroll region and never widens the page" (wrap `scrollWidth` 2,186 against a 1,094px panel, the wrapper's border box the panel's full width; panel and page `scrollWidth` each equal their `clientWidth`; the toolbar's and the caption's rects are unmoved after the wrapper is scrolled 200px in each axis; the box holds 4.5% of the wrap and its dashed edge stays 1px) and the 390 case; `DrawingSheet.test.tsx` "the boxes stay in percentages of the wrap" and "the sheet carries its own scroll region between the toolbar and the caption"
- [x] A provenance link and any other `highlightedRef` change keep the box in view at either zoom (a region click focuses its field instead, and moves nothing); no smooth scrolling, no transitions — `zoom.spec.ts` "a provenance link brings its box into the scroll region at 2×" (the active box's rect lies inside the wrapper's, the wrapper's `scrollLeft` > 0); `DrawingSheet.test.tsx` "a zoom change and a new highlight both bring the active box into view, centered"; `scroll-behavior` and the wrap's `transition-duration` are `auto` / `0s` with and without `prefers-reduced-motion`
- [x] No wheel or pinch handling; radio-group keyboard behaviour; the scroll wrapper is keyboard-scrollable — `zoom.spec.ts` "the control is the only way to zoom" and "arrow keys move between the segments and the scroll region scrolls from the keyboard" (Tab from the checked segment lands on the wrapper; ArrowDown moves its `scrollTop`)
- [x] `pnpm test`, `pnpm e2e`, `pnpm build`, `pnpm check:inline` green; CSS within budget; no new dependency — 282 unit tests, 46 Playwright checks; CSS 27,495 bytes raw (budget 28,000), JS 73.46 KB gzip (budget 180 KB); `package.json` unchanged
- [x] `webmcp-tools.ts`, `reducer.ts` and the action unions unchanged — `git diff origin/main HEAD -- src/state src/webmcp-tools.ts` is empty
- [x] Task file boxes ticked with evidence in the pull request description

Builder evidence: 282 unit tests, 46 Playwright checks, production build and inline-script check pass. CSS 27,495 bytes raw; JavaScript 73.46 KB gzip. Screenshots at 1920 and 390, at rest and at `2×` with a highlighted box, are in `docs/qa/p4/` and in the pull request, regenerated after the review fixes. An independent review pass has run and its findings are fixed on the branch (the pull request lists each one against its commit).

## Open question for review — ruled

Export 17 draws the toolbar and the caption outside the scrolling area: they stay put on the document lane while only the sheet pans. § UI rules make the panel itself the scroll region (`overflow: auto` on the panel, `tabindex="0"` on the panel, and the § Tests line "the panel is the scrolling element"), which means the toolbar and the caption pan with the sheet — visible in the `2×` screenshots, where the sheet name has slid out of view. The rule was followed. Pinning them would need the scroll region to move inside the sheet, or the figure to span the scroll width so a sticky toolbar has room to stay — either is a change to the rule, not to the implementation.

**Second ruling (2026-09-02): the sheet name is removed** — a count of sheets the package does not carry raises the question how to reach them. The `sheet` field goes out of the drawing document in `data/package.json` with it; `read-results.ts` keeps its conditional spread, so a package that does carry the field still reports it.

**Ruling (2026-09-02): export 17 wins.** § UI rules `2×` and Keyboard and the § Tests lines are rewritten above: the scroll region is an inner wrapper around the image wrap (`drawing-sheet__scroll`), the toolbar and the caption stay on the lane, the Drawing tab panel is no longer a scroll container. Built and green under the rewritten rules; the acceptance boxes are ticked against them, and the screenshots show the sheet name and the caption in place at `2×`.

## Out of scope

Pan by drag, zoom levels beyond `2×`, a minimap, zoom on the email or spec tabs.
