import type { Locator, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Fixture, Step } from '../src/replay/replay';

/**
 * Evidence screenshots are written into `docs/`, which is a record the
 * repository keeps, so a plain run leaves them alone: they are regenerated only
 * when the run asks for it with `EVIDENCE=1`.
 */
export const EVIDENCE = process.env.EVIDENCE === '1';

/** Writes one evidence screenshot, and reports whether the run wanted it. */
export async function saveEvidence(target: Locator | Page, path: string): Promise<boolean> {
  if (!EVIDENCE) return false;
  await mkdir(dirname(path), { recursive: true });
  await target.screenshot({ path, animations: 'disabled' });
  return true;
}

export async function installModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools: Record<string, { execute(input: unknown): Promise<unknown> }> = {};
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: { name: string; execute(input: unknown): Promise<unknown> }, options?: { signal?: AbortSignal }) {
          tools[tool.name] = tool;
          options?.signal?.addEventListener('abort', () => delete tools[tool.name], { once: true });
        },
      },
    });
    Object.assign(window, { __spotcheckTools: tools });
  });
}

export async function executeTool(page: Page, name: string, input: unknown): Promise<Record<string, unknown>> {
  return page.evaluate(async ([toolName, toolInput]) => {
    const tools = (window as unknown as { __spotcheckTools: Record<string, { execute(input: unknown): Promise<unknown> }> }).__spotcheckTools;
    return await tools[toolName].execute(toolInput) as Record<string, unknown>;
  }, [name, input] as const);
}

/**
 * The `no-api` path, declared rather than assumed: a browser without WebMCP.
 * Every spec states which of the two worlds it is testing in, so none of them
 * turns green or red on whatever the runner happens to expose.
 */
export async function removeModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
  });
}

/**
 * Milliseconds the fake clock must run for the fixture's replay to have
 * processed the first step matching `predicate`, plus one agent step of
 * margin so the row has settled. Steps replay at 900ms (agent) / 1500ms
 * (estimator) cadence (see `src/replay/replay.ts`) — this derives the wait
 * from the fixture's own step order and actors instead of a literal that
 * only fits one recording.
 */
export function waitForStep(fixture: Fixture, predicate: (step: Step, index: number) => boolean): number {
  const index = fixture.steps.findIndex(predicate);
  if (index === -1) throw new Error('fixture has no step matching the predicate');
  return fixture.steps.slice(0, index + 1).reduce((ms, step) => ms + (step.actor === 'agent' ? 900 : 1500), 0) + 900;
}

/** The `waitForStep` case a spec reaches for most: the first `propose_field` for `fieldId`. */
export function waitForProposal(fixture: Fixture, fieldId: string): number {
  return waitForStep(fixture, step => step.actor === 'agent' && step.call.tool === 'propose_field' && (step.call.input as { field_id?: string })?.field_id === fieldId);
}
