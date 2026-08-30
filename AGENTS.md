# AGENTS.md

Spotcheck is a review workspace for manufacturing quotes: an agent reads an RFQ package through WebMCP tools and proposes field values with provenance; the estimator verifies, resolves and confirms. The agent can propose; only a person can verify, edit or confirm.

## Sources of truth

Resolve conflicts in this order:

1. `build-spec.md` — tool contract with JSON Schemas, field taxonomy, fixture format, component inventory.
2. `DESIGN.md` — design constraints, including the asymmetric tool contract and the guard rules.
3. `docs/scenarios.md` — the scenario list; task files and QA records cite its ids.
4. `tasks/` — one file per task; `tasks/INDEX.md` mirrors each task's `Status:` line. Update both together.

## Stack

- Plain HTML/CSS/TypeScript, bundled with Vite. No framework unless a task file says otherwise.
- Static hosting. No server code, no tracking, no third-party scripts, no secrets.
- All tools live in `src/webmcp-tools.ts` and are registered with the literal call form `document.modelContext.registerTool({...})`.

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
- A field the estimator has edited or confirmed is locked against `propose_field`; the tool returns the current value in a structured rejection and the UI shows the proposal as a suggestion card.
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

A builder's own report never closes a task.

## Conventions

- English throughout: code, comments, commit messages, documents.
- Refer to roles ("the reviewer", "the builder"), not to people.
- Task files carry goal, scope, acceptance criteria, `Status:` and the pull request link. Working notes stay out of the repository.
- Demo data uses fictional customer and company names; public-domain source documents keep their `SOURCE.md` attribution.
