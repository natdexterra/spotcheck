import type { Locator, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

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
