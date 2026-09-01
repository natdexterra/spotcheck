# DESIGN.md

Design constraints for the Spotcheck review workspace, written as code. `src/styles/tokens.css` is generated from the tables here; a value that is not in this file is not a token. The tool contract and state machine live in `build-spec.md`; this file states what they *look like* and which visual rules are load-bearing.

## Constraint 1 — the asymmetric contract is visible

The agent proposes; only a person verifies, edits, resolves and confirms. The UI must make that asymmetry legible at a glance:

- **Verified styling is unreachable by the agent.** The green check badge, the resolution label and the collapsed verified group render only from human-dispatched actions. No tool result may style a field as settled. Agent states (`needs_review`, `conflict`, `missing`) read as *open questions*, never as achievements.
- **Badge text comes from `resolution.kind`, never from the state name.** Labels: Verified · Edited · Entered · Picked · Not required · Applied · Asked customer. A dismissed field must read "Not required", not "Verified"; null-value resolutions get their own icon.
- **The suggestion card is subordinate.** An agent proposal on a locked field renders as a hairline card tagged `agent`, visually quieter than the field's current value. It never uses the verified green and never replaces the value display.
- **Provenance is the primary element.** Every proposal and candidate shows its source chips (`spec:s3.1`, `email:p2`, `drawing:width`) in mono; chips are clickable and drive the two-way highlight. No chip, no claim: a value without provenance cannot appear in the field pane at all — the tool layer already rejects it, and no component accepts a value prop without `source_refs`.
- **Two actors, one log.** Change-log entries and announcements always name the actor. Agent-attributed text (rationale, notes) is set in the sans, `--ink-secondary`, prefixed "Agent:" — visibly *reported speech*, not app copy. It never uses mono: mono belongs to data, and log-file texture buries the meaning.

## Constraint 2 — documents are untrusted input

- All document text, rationale and notes render through `textContent`. The stylesheet must not give `.untrusted` content any interpretation affordances: no prose styling that could make an injected instruction look like UI copy, no link auto-detection, no markdown.
- Locked fields show a small lock glyph beside the field label; the lock never releases and the glyph never disappears.
- Reads are visible: the source tab shows a "reading" marker and the section briefly highlights during a live `read_document` call, so the reviewer sees exactly what the agent received.

## Visual direction — cool engineering drafting

The workspace reads like a well-kept engineering document register, not a chat product: a cool gray-blue canvas with white working panels, near-black ink, 1px hairline rules instead of decorative boxes, sharp corners, one drafting-blue accent, and mono for everything that is *data* (values, units, ids, counts, timestamps). Density is high; hierarchy comes from type roles and rules, not from color. The canvas is light and high-luminance, one step below pure white so large fields do not glare, with a cool cast.

- Light theme only. `color-scheme: light` is declared; a dark theme is out of scope for this codebase.
- **No shadows, no blur.** Every surface is flat. The suggestion card and overlay sheets are set off by `--bg-raised` plus a 1px `--hairline-strong` border, never by elevation effects.
- Borders, hairlines and dividers are **solid colors, never an alpha or `color-mix()` over the surface** — a translucent line renders differently on canvas and on raised panels and breaks the drafting register.
- Corners: `--radius-1` (2px) for chips and badges, `--radius-2` (4px) for cards, panels and inputs. Nothing rounder.

## Color tokens

State is always carried by icon + label (see State iconography); tints are decorative reinforcement only.

| Token | Value | Use |
|---|---|---|
| `--bg-canvas` | `#F5F7FA` | page ground |
| `--bg-raised` | `#FFFFFF` | cards, panels, inputs, sheets |
| `--ink` | `#0E1116` | primary text, primary buttons |
| `--ink-secondary` | `#5A6573` | labels, secondary text, agent notes |
| `--ink-muted` | `#626D7A` | timestamps, placeholders (md size and up only) |
| `--ink-faint` | `#9AA4B2` | disabled text, decorative glyphs — never for readable text |
| `--hairline` | `#E3E8EE` | rules, dividers, card borders |
| `--hairline-strong` | `#CBD2DB` | emphasized dividers (decorative only) |
| `--border-input` | `#808A99` | input and editor boundaries (must hold ≥ 3:1) |
| `--accent-text` | `#1A56C4` | links, provenance chip text |
| `--accent` | `#1F6FEB` | focus ring, active markers, graphical accents |
| `--accent-strong` | `#14418F` | hover color for links and text buttons |
| `--bg-subtle` | `#ECEFF3` | secondary button fill, text-button hover pill, quiet chips |
| `--ink-hover` | `#2A313A` | primary button hover fill |
| `--ink-active` | `#1A1F26` | primary button active fill |
| `--highlight` | `#E7F0FE` | provenance flash background (both panes) |
| `--highlight-edge` | `#1F6FEB` | active region outline, reading marker |
| `--state-conflict` | `#C2293A` | conflict icon + label text |
| `--state-conflict-tint` | `#FCE8EA` | conflict row tint |
| `--state-missing` | `#8A5A00` | missing icon + label text |
| `--state-missing-tint` | `#FFF4E0` | missing row tint |
| `--state-verified` | `#0E7A45` | verified icon + resolution label |
| `--state-verified-tint` | `#E4F6EC` | verified row tint |
| `--state-neutral` | value of `--ink-secondary` | needs_review icon + label |
| `--state-empty` | value of `--ink-muted` | empty icon + label |

Only the two alarming agent flags (conflict, missing) and the human-only verified state get color; `needs_review` and `empty` stay in ink so the accent blue remains unambiguously *interactive*. Field state renders as a 3px left marker bar plus a dot-and-word badge in human wording ("Two sources disagree", "Not found", "Unit missing", "Edited by you · 0:42 ago") — never a bordered badge, never a full-row tint.

## Interaction states

Every interactive class has all five states; transitions run at `--dur-1` (120ms) ease-out. One primary button per screen — Confirm, Send or Play sample session; an open inline editor or reason picker owns a local primary (Save, Mark not required) for as long as it is open, and only one of them can be open at a time.

| Class | Default | Hover | Active | Disabled |
|---|---|---|---|---|
| Primary (Confirm, Send, Play sample session) | `--ink` fill, `--bg-raised` text | `--ink-hover` fill | `--ink-active` fill | `--ink-faint` fill, no hover, default cursor |
| Secondary (Verify, Pick, Enter value, Export, Pause) | `--bg-subtle` fill, ink text, no border | `--hairline` fill | `--hairline-strong` fill | `--bg-subtle` fill, `--ink-faint` text |
| Text button (Dismiss, Edit, Ask customer, Show tools ▾, Back to {field} in a sheet footer) | `--accent-text`, no underline ever | `--bg-subtle` pill, `--accent-strong` text | `--hairline` pill | `--ink-faint` text |
| Inline link — provenance ref (`spec §1.1`) | `--accent-text`, dotted underline, offset 3px | `--accent-strong`, solid underline | — | — |
| Inline link — jump link ("2 conflicts") | `--accent-text`, solid underline, offset 3px | `--accent-strong` | — | — |

The rule behind the split: an underline means *this takes you somewhere*; its absence means *this acts here*. Text buttons therefore never carry an underline, and links always do. Focus for every class is the global ring (see Focus and keyboard). Disclosure text buttons carry a chevron-down icon (16px, from the icon set — never a text caret). A toggle text button (Ask customer) shows its on state with a leading checked-box icon and the label in `--ink` at weight 500, `aria-pressed` set; no pill — the pill is the hover and active treatment and cannot double as a state. Borders belong to inputs only (`--border-input`); buttons are told apart by fill, never by outline. Inputs carry a visible label above them and no placeholder text; a hint is a separate muted line, never text inside the field. A choice control beside an input (the unit `in | mm` segments) matches the input's height exactly.

### Choice controls

Radios, checkboxes and the segmented unit control are the app's own drawing, not the browser's: the native `<input>` stays in the DOM for semantics and keyboard (`appearance: none`; no custom roles), and the visible control is drawn on it with tokens. One drawing, reused wherever a choice appears — the not-required picker, the Clarification covers, the unit `in | mm` control, the Ask customer on-state icon.

| Control | Box | Checked | Label |
|---|---|---|---|
| Radio | 16×16 circle, 1px `--border-input`, `--bg-raised` fill | 1.5px `--accent` ring, 6px `--accent` dot centered | md, `--ink`, 8px from the box; the whole row is the click target |
| Checkbox | 16×16, `--radius-1`, 1px `--border-input`, `--bg-raised` fill | `--ink` fill, no border, the 12px check from the icon set in `--bg-raised` | same |
| Segmented (unit `in` \| `mm`) | radio group in one `--border-input` box, `--radius-2`; each segment the input's height, padding 0 16, `--hairline-strong` separator | `--bg-subtle` fill, `--ink` mono 500 (unchecked: `--bg-raised`, `--ink-secondary` mono) | none on the segments; the group carries the visible micro-label |

Picker rows sit 4px apart on a 32px line (44px on narrow through padding, never larger boxes). Hover: border `--ink-secondary`. Focus: the global ring on the box. Disabled: `--ink-faint` border and label. A choice control never carries a state color — accent here means *chosen*, the same meaning it has on links and markers. The Ask customer toggle's leading icon is this checked checkbox at 16px.

### Contrast ledger (computed 2026-08-31, WCAG 2.x)

Re-run whenever a color token changes; this table is the current state, not a permanent truth.

- on `--bg-raised` (white): ink 18.91 · ink-secondary 5.93 · ink-muted 5.27 · accent-text 6.62 · conflict 5.72 · missing 5.93 · verified 5.40 · accent (graphical) 4.63 · border-input (graphical) 3.49
- on `--bg-canvas`: ink 17.62 · ink-secondary 5.52 · ink-muted 4.91 · accent-text 6.17 · conflict 5.33 · missing 5.52 · verified 5.03 · accent (graphical) 4.32 · border-input (graphical) 3.25
- state text on its own tint: conflict on conflict-tint 4.87 · missing on missing-tint 5.44 · verified on verified-tint 4.81 · accent-text on highlight 5.77
- `--highlight-edge` on `--highlight`: 4.04 (graphical, floor 3)
- interaction colors: accent-strong 9.62 on white · 8.97 on canvas · 8.34 on the bg-subtle pill; white on ink-hover 13.13 · on ink-active 16.56
- `--ink-faint` measures 2.52 on white — that is why it is fenced to disabled and decorative use.

Hard rules that follow:

- Readable text uses `--ink`, `--ink-secondary` or `--ink-muted`; state label text uses its state color; nothing else carries prose.
- `--accent` (`#1F6FEB`) is graphical: focus rings, markers, icon strokes. Text-sized accent content (links, chips) uses `--accent-text`.
- Hairlines never carry meaning; the input border is the only boundary that must clear the 3:1 graphical floor, and it has its own token.

## Typography — cap-height model, Geist + Geist Mono

Dense data-UI physics: sizes target *observable cap-height* — the rendered height of capital letters — on a rem grid (values computed with Capsize), line-heights land on even pixel integers at the default root, and Sans + Mono come from one family, Geist + Geist Mono, whose matched vertical metrics let a single size token serve both. Both faces are OFL, self-hosted as woff2 under `public/fonts/` — the CSP allows no third-party origins. Fallback stacks end in `system-ui` / `ui-monospace` so OS-level accessibility fonts can cascade through; a Capsize `createFontStack` metric-matched fallback (`Geist Fallback`) prevents layout shift. `font-display: swap`; preload the sans woff2 with `crossorigin`.

| Token | Cap-height | font-size | line-height | Use |
|---|---|---|---|---|
| `--text-xs` | 8 px | `0.749rem` | `--leading-xs: 0.75rem` | log timestamps, chip counts |
| `--text-sm` | 9 px | `0.842rem` | `--leading-sm: 0.875rem` | badges, chips, meta, strip roster |
| `--text-md` | 10 px | `0.936rem` | `--leading-md: 1rem`; loose `1.25rem` | field labels, buttons, actions, log entries |
| `--text-lg` | 12 px | `1.122rem` | `--leading-lg: 1.25rem`; loose `1.5rem` | **default body**: field values, document text |
| `--text-xl` | 16 px | `1.497rem` | `--leading-xl: 2rem` | pane titles, confirm summary title |

Rules the builder must not trade away:

- `:root { font-size: 100% }` — never a pixel root; every token above is rem so the user's browser preference scales the whole grid (WCAG 1.4.4).
- Default body is `lg` (cap-height 12): this surface is public-facing, and cap-height 10 under Windows 125% scaling drops below comfortable legibility. `md` is for labels and secondary rows, never for primary reading.
- **Never the `font:` shorthand** — it silently resets `font-variant-numeric` and `font-feature-settings`. Set family, size and line-height as separate properties.
- Mono (`--font-mono`) for values, units, field ids, source refs, counts, timers, error codes — with `font-feature-settings: "zero" 1`.
- `font-variant-numeric: tabular-nums lining-nums` on every numeric run (counts, timers, step counters, candidate values) so digits hold column alignment.
- `font-synthesis: none`. Weights: 400 body, 500 labels and badges, 600 titles and the confirm button.
- Single-line labels, badges, chips, buttons and tabs get `text-box: trim-both cap alphabetic`, with the Capsize `createStyleString` fallback under `@supports not` for Firefox. Never applied to multi-line copy.
- Orthotypography (real `×` in dimensions, curly quotes, non-breaking spaces before units) follows the ui-typography rules at build time; region text from documents is rendered verbatim, never typographically "improved".

## Spacing, layout, hit targets

- Spacing scale, rem at 4px steps: `--space-1: 0.25rem` · `--space-2: 0.5rem` · `--space-3: 0.75rem` · `--space-4: 1rem` · `--space-6: 1.5rem` · `--space-8: 2rem`. Micro-steps of 2px and 6px are allowed **only inside a control** for optical centering (button padding, dot-to-word gaps) — never between elements or in layout. Any other off-scale value is a defect.
- **One value per role.** Spacing is assigned by structural role, never improvised per screen:

  | Role | Value |
  |---|---|
  | inside a control (dot↔word, icon↔label) | 4 |
  | button padding | 6×12 compact · 12×16 large |
  | control heights (min-height tokens) | compact button 30 · input and segmented control 42 · large button, tab, narrow target 44 — text centered inside; the 30 and 42 are sanctioned micro-steps inside a control |
  | between inline siblings (chips, actions) and between blocks inside a row | 8 |
  | row padding | 12 block × 24 inline |
  | group heading | 16 above / 8 below |
  | card internal (candidate, suggestion) | 12×16; between cards 8 |
  | field-pane gutter | 24 |
  | document gutter — tabs and text share it | 48; paragraph gap 16; section gap 24 |
  | pane gap | 24 |
  | page margin | one token `--page-margin` (the layout ladder: 80 → 28) |

- **Two vertical lanes.** Header, status strip, workspace and log drawer all take their inline padding from `--page-margin`; content inside a pane sits on the pane-gutter lane (margin + 24). Every left edge on the screen lands on one of these two lines — an edge on neither is a defect. The 3px state marker is compensated (row inline padding 21 = 24 − 3) so row content stays on the gutter lane; that is the one sanctioned off-scale number, by construction.
- **Layout ladder (desktop).** The reference viewport is 1920×1080; the workspace is two white panes on the canvas, gap `--space-6`, side margins `padding-inline: max(28px, calc((100% - 1760px) / 2))` — 80px at 1920, shrinking first.
  1. 1920 → ~1400: margins give way (80 → 28); the source pane absorbs the rest; the field pane holds 640px.
  2. → 1280: the source pane reaches its comfortable minimum (document measure ≥ 52ch); document padding steps 48 → 32.
  3. 1280 → down: the field pane gives way 640 → 480; pane gap 24 → 16.
  4. Below 1024px: one column; the source pane opens as a sheet over the list (shell rules in the spec). On one-column widths above ~600px the content column caps at 680px, centered.
  - Anti-overlap is a rule, not a hope: each pane has an explicit min-width; values wrap and are never truncated; badges are `flex-shrink: 0`; action rows wrap. Grid: `minmax(480px, 640px) minmax(460px, 1fr)`.
- **Scroll model.** Desktop: the page does not scroll. The workspace takes the viewport height left under the header and strip (`min-height: 0` on the grid row), and each pane scrolls on its own (`overflow-y: auto`, padding on the scrolling element so the scrollbar sits at the pane edge). The reviewer keeps their row in view while a provenance click scrolls the source pane; the field-pane footer sits at the pane's bottom edge as the last flex child — no `position: sticky`, nothing from the list ever renders under it. The log drawer is a fixed-height bar under the workspace; expanded, it scrolls inside itself. Narrow: the page scrolls as one column, the confirm footer is sticky at the viewport bottom, an open sheet locks body scroll.
- The page never scrolls horizontally at 320 CSS px; anything wide scrolls inside its own wrapper (WCAG 1.4.10).
- Labels never wrap: a button, tab, chip or badge is `white-space: nowrap`; when a bar runs out of room its items stack (the log bar on narrow: sentence above, the disclosure button below, left-aligned), they do not squeeze.
- Hit targets: ≥ 24×24 CSS px everywhere (WCAG 2.5.8), ≥ 44px on the narrow layout. Dense text buttons reach it with padding (`min-height: 1.5rem` desktop, `2.75rem` narrow), not with larger type.

## State iconography

Base set: **MynaUI Icons** (mynaui.com/icons, MIT, no attribution required) — line variant, 24×24 grid, 1.5px stroke, `currentColor`. Icons are inlined as SVG components in the repo (no icon package at runtime, nothing crosses the CSP); the MIT license text ships alongside the copied SVGs (`src/icons/LICENSE`). Icons render at 16px (12px for the lock marker); if the scaled stroke reads too light next to Geist at sm/md, thicken `stroke-width` in the copied source to 1.75 — one value for the whole set, never per icon. **No composites and no custom glyphs:** every icon is one glyph from the set. In a badge the icon carries one distinction only — settled *with* a value (check) or settled *without* one (minus, envelope); how the value was settled is the label's job and the line under the value. Arrows, crosses and chevrons in the interface are icons from the set, never text characters.

Every state and resolution renders icon + text label — color is never the only carrier (WCAG 1.4.1).

| State / resolution | Icon | Label |
|---|---|---|
| `empty` | horizontal dash | Not extracted |
| `needs_review` | hollow circle, center dot | Needs review |
| `conflict` | two opposing arrows | Conflict |
| `missing` | dashed hollow circle | Missing |
| verified / `verified`, `edited`, `entered`, `picked`, `applied` | check in circle | Verified · Edited · Entered · Picked · Applied |
| verified / `dismissed` | minus in circle | Not required |
| verified / `asked_customer` | envelope | Asked customer |
| lock marker | closed padlock, 12px | paired with the badge; `aria-hidden`, text equivalent lives in the badge |

`dismissed` and `asked_customer` are the null-value resolutions: their icons must not read as a check.

**Two wordings, one icon set.** The label column above is the *short label*: it names the state in group headings, counts, the blocker line, the confirm summary, announcements and the badge's `aria-label`. The badge in a field row carries the *human wording* instead, with the same icon: `empty` "Not extracted" · `needs_review` "Needs review", or "Unit missing" when a unit-bearing field has no unit, or "Revised by agent" after the agent revised its own proposal · `conflict` "Two sources disagree" · `missing` "Not found" · verified by kind "Verified by you · 0:42 ago", "Edited by you · …", "Entered by you · …", "Picked by you · …", "Applied by you · …", "Not required · …", "Awaiting customer · …". The wording is for the person reading the row; the short label is for everything that counts, lists or announces.

**Copy grammar, load-bearing.** A badge is a status: a noun phrase or a past participle with its actor ("Needs review", "Edited by you"), never an imperative — "Check it" is a button, not a state. A button is a verb ("Verify", "Mark not required", "Enter value"); a status phrase on a button is a defect. Agent text is reported speech behind "Agent:". Log entries are sentences with the actor first, sentence case: "You edited Quantity — agent 800 → yours 750", "Agent opened the clarification draft". Neither wording ever comes from the state name of a `verified` field.

**Dot or icon.** In a field row the badge of an agent state (`empty`, `needs_review`, `conflict`, `missing`, and a reopened row) is an 8px dot in the state color plus the human wording; the badge of a `verified` row replaces the dot with the resolution icon from the table, because seven resolutions must be told apart and the null-value kinds must not read as a check. The agent-state icons from the table appear where the short label appears: group headings, the blocker line, the confirm summary. One icon set, two placements.

## Focus and keyboard

- `:focus-visible` everywhere: `outline: 2px solid var(--accent); outline-offset: 2px;` — never `outline: none` without a same-or-stronger replacement, never box-shadow-only focus.
- Focus is managed, not lost: closing an editor returns focus to its row; closing the source sheet returns focus to the chip that opened it; applying or dismissing a suggestion moves focus to the field's badge.
- The keyboard map (`j`/`k`, `Enter`, `e`, `n`, `Esc`) is defined in `build-spec.md`; this file's rule is that every binding has a visible focused state and a reachable pointer equivalent.

## Motion

- Durations: `--dur-1: 120ms` (hover, press, chip highlight in), `--dur-2: 200ms` (row arrival, panel and sheet open/close). Easing `cubic-bezier(0.2, 0, 0, 1)`. Nothing bounces.
- Field arrival: 8px rise + fade over `--dur-2`. Provenance flash: `--highlight` background in at `--dur-1`, held 2s, out over 400ms.
- `prefers-reduced-motion: reduce`: all transitions and animations off; arrivals are instant; the provenance flash becomes a static `--highlight-edge` outline that clears on blur; the strip chips appear and leave with no animation.
- Announcements accompany motion, never replace it: one polite live region as specified in `build-spec.md`.

## Non-negotiables checklist (QA gates against this file)

- [ ] No color-only state distinction anywhere
- [ ] Text contrast ≥ 4.5:1 on both grounds (ledger above re-run after any color change); input borders and graphical accents ≥ 3:1
- [ ] Borders and hairlines are solid colors — no alpha, no `color-mix()` over a surface
- [ ] Root font-size 100%; all type tokens rem; 200% browser zoom leaves the layout usable
- [ ] No `font:` shorthand; tabular figures on all numeric runs; mono for data
- [ ] Focus visible on every interactive element; focus return rules honored
- [ ] Reduced-motion path exercised, not just declared
- [ ] Untrusted text rendered as text, styled as quoted material where agent-attributed
- [ ] No third-party font, script, style or icon origin; MynaUI SVGs are copied in with their MIT license text
