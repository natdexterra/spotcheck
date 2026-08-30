# AGENTS.md

This repository builds **Spotcheck**, a WebMCP-powered review workspace for agent-extracted manufacturing RFQs, submitted to the OpenAI WebMCP Challenge (deadline 2026-09-03, 1:00 pm PT). Planning history lives in a sibling workspace and is not copied here.

## Sources of truth

Resolve conflicts in this order:

1. `build-spec.md` (root of this repo, arrives before the first build task) — tool contract with JSON Schemas, field taxonomy, fixture format, component inventory.
2. `DESIGN.md` — design constraints as code, including the two non-negotiables: the asymmetric tool contract and the guard rules.
3. `tasks/` — one file per task; `tasks/INDEX.md` mirrors each task's `Status:` line. Update both together.
4. This file.

## Stack

- Plain HTML/CSS/TypeScript, bundled with Vite. No framework unless a task file says otherwise.
- Static hosting on Vercel. No server code, no tracking, no secrets.
- Tools live in **`src/webmcp-tools.ts`** and nowhere else. Register with the literal call form `document.modelContext.registerTool({...})` so human and automated screening find it.

## WebMCP rules (verified 2026-08-30)

- Entry point is `document.modelContext` — never `navigator.modelContext`. Feature-detect with `typeof document.modelContext?.registerTool === "function"`.
- There is no `unregisterTool()`. Register with `{ signal }` and `controller.abort()` to unregister; never abort while a call to that tool is in flight.
- There is no `requestUserInteraction()` in the current spec or in either browser. Do not use it.
- Annotations: `readOnlyHint: true` on read tools; `untrustedContentHint: true` on tools that return document content.
- Tools must be registered in the top-level document (the ChatGPT browser ignores iframes and the declarative API).
- Return structured results for expected failures (`{ ok: false, code, ... }`) instead of throwing.
- Keep every tool output under ~1.5K characters; keep descriptions under 500 characters, parameter descriptions under 150, names under 30.
- The same state machine serves live tool calls, UI actions and fixture replay. One code path.

## Binding product rules

- Agent proposals never enter the `verified` state. `verified` is reachable only through UI actions.
- Fields the human has edited or confirmed are locked against `propose_field`; the tool returns the current value in a structured rejection.
- Verify, edit, resolve, confirm and "send" exist only in the UI. No tool triggers them.
- Document content and agent rationale are rendered as text, never as HTML.
- WCAG 2.2 AA. States use icon + label, not color alone. Motion respects `prefers-reduced-motion`; state changes are announced with `aria-live`.

## Delivery

Feature branch → pull request → Vercel preview → review → merge. Do not push directly to `main`. Commit history must stay inside the hackathon submission period (2026-08-25 → 2026-09-03).
