# AGENTS.md

Spotcheck is a review workspace for manufacturing quotes: an agent reads an RFQ package through WebMCP tools and proposes field values with provenance; the estimator verifies, resolves and confirms. The agent can propose; only a person can verify, edit or confirm.

## Sources of truth

Resolve conflicts in this order:

1. `build-spec.md` — tool contract with JSON Schemas, field taxonomy, fixture format, component inventory.
2. `DESIGN.md` — design constraints, including the asymmetric tool contract and the guard rules.
3. `docs/scenarios.md` — the scenario list; task files and QA records cite its ids.
4. `tasks/` — one file per task; `tasks/INDEX.md` mirrors each task's `Status:` line. Update both together.

## Stack

- React 18 + TypeScript + Vite, static single-page app. No router, no server framework.
- React renders; it never owns state. The reducer in `src/state/reducer.ts` is plain TypeScript with no React imports and is tested without React. A small external store exposes `dispatchAgent` and `dispatchHuman`; components subscribe with `useSyncExternalStore`.
- Plain CSS with custom properties from `DESIGN.md`. No Tailwind, no CSS-in-JS, no inline styles for tokens.
- One drawing per component. The shared primitives are listed in `DESIGN.md` § Components, one row each, with the component that renders them, their class names in `src/styles/components.css`, their states and their heights. A task adds a modifier to a primitive that is already in that table before it adds a new block, and a primitive that is new to the app enters the table in the pull request that introduces it.
- An element that is hidden with the `hidden` attribute never receives an author `display` value without `:not([hidden])`; `base.css` carries the global `[hidden] { display: none !important }` guard, and a stylesheet test keeps it. After any change to a panel, sheet, drawer or dialog, the evidence includes the states where it must be absent, not only where it shows.
- CSS size is reported in every pull request; it is not a gate. The JavaScript budget is.
- Static hosting. No server code, no tracking, no third-party scripts, no secrets.
- All tools live in `src/webmcp-tools.ts` and are registered with the literal call form `document.modelContext.registerTool({...})`. That module imports `dispatchAgent` and nothing from the human action set; a test asserts it.

## WebMCP rules

- Entry point is `document.modelContext`, never `navigator.modelContext`. Feature-detect with `typeof document.modelContext?.registerTool === "function"`.
- There is no `unregisterTool()`. Register with `{ signal }` and call `controller.abort()` to unregister; never abort while a call to that tool is in flight.
- Do not use `requestUserInteraction()`; it is not part of the current specification or of shipping browsers.
- Annotations: `readOnlyHint: true` on read tools; `untrustedContentHint: true` on tools that return document content.
- Register tools in the top-level document only; iframes and the declarative API are not discovered by every agent browser.
- Return structured results for expected failures (`{ ok: false, code, ... }`) instead of throwing.
- Keep every tool output under 1,500 characters, descriptions under 500, parameter descriptions under 150, names under 30.
- One state machine serves live tool calls, UI actions and fixture replay.

## Product rules

- Agent proposals never enter the `verified` state; `verified` is reachable only through UI actions.
- A field the estimator has acted on (verified, edited, picked, dismissed, or started typing in) is locked against every write tool; the tool returns the current value in a structured rejection and the UI shows a differing proposal as a suggestion card. Locks never release.
- Verify, edit, resolve, confirm and send exist only in the UI. No tool triggers them.
- Document text and agent rationale are rendered as text (`textContent`), never as HTML.
- `Content-Security-Policy: default-src 'self'`; `Permissions-Policy: tools=(self)`; no `exposedTo` on any tool.
- WCAG 2.2 AA. States use icon + label, not color alone. Motion respects `prefers-reduced-motion`; state changes are announced through a live region.

## Delivery

Feature branch → pull request → preview deploy → QA → owner review → merge. Do not push directly to `main`.

Gates on every pull request:

1. **Builder self-check** — tests pass, `pnpm build` is clean, the task's acceptance criteria are ticked in the task file with evidence.
2. **QA** — run by a different agent than the builder: Playwright checks against `build-spec.md` and `docs/scenarios.md` (tool contract via `getTools()`/`executeTool()`, fixture replay, console clean), accessibility audit, code review. The QA record goes into the pull request description.
3. **Owner review** — the repository owner reviews the preview and the diff. Approval is required; no pull request merges on QA alone.

Evidence screenshots under `docs/qa/` are opt-in: `EVIDENCE=1 pnpm e2e` writes them, and a plain `pnpm e2e` leaves everything under `docs/` untouched.

A builder's own report never closes a task.

## Conventions

- Refer to roles ("the reviewer", "the builder"), not to people.
- Task files carry goal, scope, acceptance criteria, `Status:` and the pull request link. Working notes stay out of the repository.
- Demo data uses fictional customer and company names; public-domain source documents keep their `SOURCE.md` attribution.
