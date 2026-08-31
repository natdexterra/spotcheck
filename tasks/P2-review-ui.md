# P2 — Review UI: two panes, provenance both ways, resolutions

**Status:** queued (blocked until P1 merges)
**PR:** —
**Depends on:** P1 (reducer, tool layer, replay)

## Goal

The visible product: the two-pane review workspace driven by the store — risk-ordered field rows with the five states, the conflict panel, the suggestion card, inline editing, the missing flow, the clarification editor, the confirm summary, and the two-way provenance highlight including the drawing overlay. Visual truth is `DESIGN.md` (tokens, interaction states, layout ladder, two-lane spacing); structural truth is `build-spec.md` § Screens / § Component inventory.

## Scope — files to create

| Path | Responsibility |
|---|---|
| `src/styles/tokens.css` (modify) | re-transcribe from current DESIGN.md: add `--page-margin`, `--accent-strong`, `--bg-subtle`, `--ink-hover`, `--ink-active` if missing; spacing-role comments |
| `src/components/Header.tsx`, `StatusStrip.tsx` | header; strip states no-api/waiting/live/confirmed with quiet summary line, expandable roster, copyable prompt (waiting), announcements via the live region |
| `src/components/FieldList.tsx`, `FieldRow.tsx`, `Badge.tsx`, `MarkerBar` (in-row) | risk sort, group headings with counts, collapsed verified, dot-and-word badges, 3px markers, lock glyph |
| `src/components/ConflictPanel.tsx`, `SuggestionCard.tsx`, `InlineEditor.tsx` | candidates with Pick + enter-another; agent suggestion with Apply/Dismiss; editor with edit_start lock on first keystroke, Enter saves+verifies, Esc restores focus |
| `src/components/SourcePane.tsx`, `EmailDoc.tsx`, `SpecDoc.tsx`, `DrawingSheet.tsx`, `OverlayBox.tsx` | tabs, region rendering via `textContent` only, reading marker, provenance flash; drawing WebP with normalized overlay boxes, box click focuses the field |
| `src/components/ClarificationEditor.tsx` | subject/body/covers checkboxes limited to gaps, mock Send (diff to log), Discard |
| `src/components/ConfirmFooter.tsx`, `ConfirmSummary.tsx` | disabled-with-jump-links blocker line; summary with counts, lists, review time |
| `src/components/ChangeLogDrawer.tsx`, `LiveRegion.tsx` | collapsed drawer with last entry, expand, export button + import input; one polite region with the batching rules |
| `src/icons/` | MynaUI SVG components used + custom composites + `LICENSE` |
| `e2e/review.spec.ts` | Playwright: S2 propose→highlight→verify→collapse; S3 pick; S6 card; B9 keyboard run; B10 at 390/820/1024/1366; B11 reduced-motion + announcements |

## Order of work (TDD where testable; commit per green step)

1. tokens.css re-transcription + spot-test extension → commit.
2. Static shell (Header, StatusStrip states from store) with tests for strip-state selection (B1/B2 logic) → commit.
3. FieldRow states rendered from store fixtures (one state per test) → FieldList sort + groups → commit.
4. Interactions: verify/edit/enter/pick/dismiss/apply wired to `dispatchHuman`; editor lock on first keystroke (unit) → commit.
5. SourcePane + provenance both ways (click chip → tab+scroll+flash; click region/box → focus row); DrawingSheet overlay from `data/package.json` boxes → commit.
6. ClarificationEditor (opens on store flag from `draft` action; send covers → asked_customer) → commit.
7. ConfirmFooter/Summary; keyboard map; LiveRegion; reduced-motion CSS → commit.
8. Playwright e2e pass; fix; commit.

## Acceptance criteria

- [ ] Every S-scenario UI element from `docs/scenarios.md` S1–S10 renders per the approved visuals; DESIGN.md interaction-states table implemented exactly (underline = navigation rule; one primary per screen)
- [ ] Provenance works both directions incl. the drawing overlay; `?quiet=1` removes `email:note` from render
- [ ] All document/agent text rendered via `textContent` (T4 unit test with `<img onerror>` region)
- [ ] Keyboard run green (B9); reduced-motion + live-region behavior per build-spec (B11); layouts hold at 390/820/1024/1366/1920 with no horizontal page scroll (B10, ladder)
- [ ] `pnpm test` and `pnpm e2e` green; `pnpm build` clean; no new runtime dependency; icons inlined with license file
- [ ] Contrast spot-checks from DESIGN.md ledger hold in computed styles (test the badge and blocker-line pairs)

## Out of scope

Fallback strip replay controls and export/import UI (P3), real recorded session (item 14 equivalent), O1 plausibility note.
