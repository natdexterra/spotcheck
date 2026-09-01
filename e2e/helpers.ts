import type { Page } from '@playwright/test';

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

