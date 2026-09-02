# P4 — Drawing zoom

**Status:** queued
**PR:** —
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
| `src/components/SourcePane.tsx` (modify) | the Drawing tab panel gets the scroll wrapper class; nothing else |
| `src/styles/components.css` (modify) | toolbar, the `2×` image width, the scroll wrapper |
| `src/components/DrawingSheet.test.tsx` (create), `e2e/zoom.spec.ts` (create) | § Tests |

No new dependency.

## UI rules (normative)

- **Toolbar.** A row above the sheet, on the document lane, `--space-3` under the tab row: left, the caption's second line moves here as the sheet name, "Sheet 1 of 4" (`md`, `--ink-secondary`); right, the micro-label "Zoom" and the segmented control with two options labelled `1×` and `2×` (the real multiplication sign, U+00D7; `aria-label` "Zoom 1x" / "Zoom 2x" for speech). Default `1×`. The choice is UI state for the session (never the reducer, never storage). The figcaption keeps its first line ("a revision letter would live here; there is none") and the clickable-regions note.
- **`1×`.** As today: the image at the wrapper's width, intrinsic aspect ratio.
- **`2×`.** The image wrap is `width: 200%` of the panel's content width; the Drawing tab panel scrolls in both directions inside itself (`overflow: auto`, the scroll region is the panel, not the page; the scrollbars sit at the panel edge). Overlay boxes are positioned in percentages of the wrap and scale with it; the dashed edge stays 1px (a border, not a scaled stroke). Font size of the caption and toolbar does not change with zoom.
- **Provenance into the drawing at `2×`.** A provenance link or a region click that sets `highlightedRef` scrolls the box into view inside the panel (`scrollIntoView({ block: 'center', inline: 'center' })`, `behavior: 'auto'` — no smooth scrolling here, the flash is the motion). Switching zoom while a box is highlighted keeps it in view the same way. Under `prefers-reduced-motion` nothing changes: the zoom is instant either way, and no transition is applied to width or transform.
- **No wheel zoom, no pinch.** `wheel` and `gesture` events are not handled; ctrl + wheel is left to the browser (page zoom). The control is the only way to change zoom.
- **Keyboard.** The segmented control is a radio group: arrow keys move between `1×` and `2×`, focus ring per DESIGN.md. At `2×` the panel is scrollable by keyboard because it is the focused scroll container (`tabindex="0"` on the panel with an `aria-label` "Drawing sheet, scrollable").
- **Narrow (< 1024px).** Same toolbar in the source sheet; the control's targets are 44px; at `2×` the sheet body scrolls horizontally inside its own wrapper, so the page never scrolls horizontally (WCAG 1.4.10 holds at 320px).
- **Reading marker.** The `--reading` outline on the image wrap follows the wrap at either zoom.

## Order of work (test first; one commit per green step, subjects `P4 <area>: …`)

1. `DrawingSheet.test.tsx`: the toolbar renders a radio group named "Zoom" with `1×` checked; choosing `2×` adds `drawing-sheet--zoom-2`; box percentages are unchanged by zoom; `scrollIntoView` (spied) is called with `block: 'center', inline: 'center'` on the active box after a zoom change and after a new `highlightedRef` → implement → commit.
2. CSS: toolbar, `2×` width, the panel scroll wrapper; the layout guard still green → commit.
3. `e2e/zoom.spec.ts` (below); fix what it finds → commit. Screenshots at 1920 and 390 at `2×` with a highlighted box; acceptance boxes → final commit.

## Tests

Playwright `e2e/zoom.spec.ts` (production build):

- 1920: open the Drawing tab; `2×` → the image wrap's `scrollWidth` is about twice the panel's `clientWidth` (± 2px); `document.documentElement.scrollWidth` equals `clientWidth` (no page scroll); the panel is the scrolling element (its `scrollWidth` > `clientWidth`).
- Provenance: from a replayed session (`Play sample session`, advance until `overall_dimensions` shows), click its `drawing` provenance link at `2×` → the active box's bounding rect lies inside the panel's bounding rect.
- Wheel: dispatch a `wheel` event with `ctrlKey` on the image → the radio group still reads `1×`.
- Keyboard: focus the radio group, press ArrowRight → `2×` checked; Tab → the panel takes focus; ArrowDown scrolls it (`scrollTop` > 0).
- 390: the source sheet at `2×` → no horizontal page scroll; the control's targets ≥ 44px.
- `prefers-reduced-motion: reduce` emulated: switching zoom produces no running animation or transition on the wrap.
- Console clean throughout.

## Acceptance criteria

- [ ] Toolbar per § UI rules at 1920 and 390 (screenshots in the pull request); `×` is U+00D7; default `1×`
- [ ] `2×` doubles the sheet inside a self-scrolling panel; page never scrolls horizontally; overlay boxes and the reading outline follow the image
- [ ] Provenance and region activation keep the box in view at either zoom; no smooth scrolling, no transitions
- [ ] No wheel or pinch handling; radio-group keyboard behaviour; the panel is keyboard-scrollable
- [ ] `pnpm test`, `pnpm e2e`, `pnpm build`, `pnpm check:inline` green; CSS within budget; no new dependency
- [ ] `webmcp-tools.ts`, `reducer.ts` and the action unions unchanged
- [ ] Task file boxes ticked with evidence in the pull request description

## Out of scope

Pan by drag, zoom levels beyond `2×`, a minimap, zoom on the email or spec tabs.
