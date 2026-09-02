# Evals

Test cases for the model-facing half of the tool contract, in the format of [`webmcp-evals`](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals) (Chrome's experimental runner). Deterministic tests of the tools themselves live in `src/` and `e2e/`; these cases ask a different question: does an agent pick the right tool, with the right arguments, in the right order?

## Files

| File | Purpose |
|---|---|
| `cases.json` | Six cases an agent should pass on a fresh page: list before any read (S1), a direct proposal with provenance (S2), disagreement becomes `report_conflict` (S3), absence becomes `report_missing` rather than a guess (S5), dimensions from the drawing (S4), progress questions go to `get_review_state` (S9). |
| `cases-with-gaps.json` | One case that needs an open gap, because `draft_clarification` registers only then: open questions go to the clarification draft (S8). Run it in `local` mode against `tools.json`, which carries the full seven-tool roster. |
| `smoke.json` | Two cases with concrete arguments for `smoke` mode: a full contract walk (list → read → propose → conflict → missing → draft → state) and the structured rejections (`NO_SOURCE_REF`, `INVALID_SOURCE_REF`, then a valid proposal). Last run against production on 2026-09-02 with stable Chrome: 11/11 steps. |
| `tools.json` | The registered tool schemas, exported from the app by `node scripts/export-tools.mjs`. Regenerate after any change to `src/webmcp-tools.ts`. |

## Running

`smoke` needs no model and no API key. It opens the live page in Chrome and executes each case's expected calls in order; a fresh page per case.

```bash
npx webmcp-evals smoke -u https://spotcheck-rfq.vercel.app -e evals/smoke.json --chrome-channel chrome -v
```

`local` and `browser` drive a model. Put a key in `.env` (`GOOGLE_AI` for Gemini; `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` through the Vercel AI SDK backend), then:

```bash
npx webmcp-evals local -b gemini -t evals/tools.json -e evals/cases.json
npx webmcp-evals local -b gemini -t evals/tools.json -e evals/cases-with-gaps.json
npx webmcp-evals browser -u https://spotcheck-rfq.vercel.app -e evals/cases.json
```

Reports land in `.evals/` (ignored by git).

## What the matchers mean

`$any` and `$contains` describe what an agent's call must include; the runner's `smoke` mode replaces them with placeholder values, so running `cases.json` in `smoke` mode exercises the validation path (the tools answer with structured rejections such as `NO_SOURCE_REF` and `SCHEMA`), not the happy path. `smoke.json` carries concrete arguments for that.

## Known limits

- A locked field (S6) cannot be set up from a fresh page in `browser` mode; the Playwright test `e2e/tools.spec.ts` covers `FIELD_LOCKED` deterministically.
- The runner scores whether the expected calls appear in the agent's trajectory. A guessed `propose_field` for `general_tolerance` would show in the report as an extra call, not as a failed match; read the trajectory, not only the pass count.
