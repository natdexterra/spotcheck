import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

export interface TestTool {
  name: string; description: string; inputSchema: { properties?: Record<string, { description?: string }> };
  annotations?: Record<string, boolean>; execute: (input: unknown) => Promise<unknown>;
}
export const modelContext = () => {
  const roster = new Map<string, TestTool>();
  const events: string[] = [];
  const context = { registerTool: vi.fn((tool: TestTool, options?: { signal?: AbortSignal }) => {
    roster.set(tool.name, tool); events.push('toolchange');
    options?.signal?.addEventListener('abort', () => { roster.delete(tool.name); events.push('toolchange'); });
  }), getTools: () => [...roster.values()] };
  vi.stubGlobal('document', { modelContext: context });
  return { context, roster, events };
};

test('registration: six literal tools on load, exact descriptions, annotations and budgets', async () => {
  const { roster } = modelContext();
  await import('./webmcp-tools');
  expect([...roster.keys()]).toEqual(['list_rfq_documents', 'read_document', 'propose_field', 'report_conflict', 'report_missing', 'get_review_state']);
  const spec = readFileSync('build-spec.md', 'utf8');
  for (const tool of roster.values()) {
    expect(spec).toContain('> ' + tool.description);
    expect(tool.description.length).toBeLessThanOrEqual(500);
    expect(tool.name.length).toBeLessThan(30);
    for (const prop of Object.values(tool.inputSchema.properties ?? {})) expect(prop.description?.length ?? 0).toBeLessThanOrEqual(150);
    expect(tool).not.toHaveProperty('exposedTo');
  }
  expect(roster.get('list_rfq_documents')?.annotations).toEqual({ readOnlyHint: true });
  expect(roster.get('read_document')?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
  expect(roster.get('get_review_state')?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
});
