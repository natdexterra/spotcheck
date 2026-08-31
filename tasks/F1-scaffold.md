# F1 — Scaffold: Vite + React 18 + TypeScript, tests, CSP

**Status:** queued
**PR:** —
**Depends on:** nothing (first build task)

## Goal

A deployable empty shell: the toolchain, the token stylesheet, the external-store skeleton with the two dispatchers, security headers, and both test harnesses running green. No product UI beyond a mounting shell.

## Scope — files to create

| Path | Responsibility |
|---|---|
| `package.json` | pnpm; deps: `react@18`, `react-dom@18`; dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@playwright/test` |
| `tsconfig.json` | strict, `noUncheckedIndexedAccess` |
| `vite.config.ts` | React plugin; build must emit **no inline scripts** so `default-src 'self'` holds |
| `index.html` | title "Spotcheck", font preloads (`crossorigin`), root div |
| `public/fonts/` | Geist + Geist Mono woff2 (OFL), self-hosted |
| `src/styles/tokens.css` | every custom property from `DESIGN.md` tables, values verbatim; `Geist Fallback` metric-matched `@font-face` |
| `src/styles/base.css` | root `font-size: 100%`, body defaults per DESIGN.md typography rules, focus ring, reduced-motion block |
| `src/state/store.ts` | external store: `getState`, `subscribe`, `dispatchAgent(action: AgentAction)`, `dispatchHuman(action: HumanAction)`; reducer imported from `./reducer` (stub identity reducer for now) |
| `src/state/types.ts` | `AgentAction` union (`read | propose | report_conflict | report_missing | draft`), `HumanAction` union (12 members per build-spec), `Field`, `FieldState`, `FieldId` |
| `src/main.tsx`, `src/App.tsx` | mount, `useSyncExternalStore` wiring, placeholder shell |
| `vercel.json` | headers: `Content-Security-Policy: default-src 'self'`, `Permissions-Policy: tools=(self)` |
| `playwright.config.ts`, `e2e/smoke.spec.ts` | app boots, no console errors, root renders |
| `src/state/store.test.ts` | subscribe/notify, dispatch routes to reducer |

## Order of work (TDD, commit after each green step)

1. `package.json` + lockfile; `pnpm install` clean.
2. Failing `store.test.ts` (subscribe receives updates; `dispatchAgent` and `dispatchHuman` both reach the reducer with an actor tag) → run, watch it fail → implement `store.ts` + `types.ts` → green → commit.
3. Vite + tsconfig + entry files; `pnpm build` clean; grep `dist/` for `<script>` without `src` → none → commit.
4. `tokens.css` transcribed from DESIGN.md; a unit test asserts six spot values (`--bg-canvas: #F5F7FA`, `--text-lg: 1.122rem`, `--leading-md: 1rem`, `--radius-2: 4px`, `--space-3: 0.75rem`, `--border-input: #808A99`) by parsing the file → commit.
5. Fonts + preload + fallback face; build; commit.
6. `vercel.json` headers; `e2e/smoke.spec.ts` green against `vite preview`; commit.

## Acceptance criteria

- [ ] `pnpm build` clean; `pnpm test` (vitest) and `pnpm e2e` (Playwright smoke) green
- [ ] `dist/` contains no inline `<script>` (checked by a script, not by eye)
- [ ] `tokens.css` spot-check test passes; no color/size literals in `base.css` that duplicate a token
- [ ] `src/state/types.ts` action unions match build-spec exactly; `store.ts` exports only `getState`, `subscribe`, `dispatchAgent`, `dispatchHuman`
- [ ] `vercel.json` carries both headers verbatim
- [ ] No dependency beyond the list above; no router, no CSS framework, no icon package

## Out of scope

Reducer logic (P1), any product UI (P2), fallback strip (P3), data files (D1).
