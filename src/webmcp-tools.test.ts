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

test('validation: structured input errors and successful reads/proposals', async () => {
  const { executeTool } = await import('./webmcp-tools');
  const good = { field_id: 'material', value: '6061', source_refs: ['spec:s1.1'] };
  for (const [name, input, code] of [
    ['read_document', { doc_id: 'unknown', section_id: 's1' }, 'UNKNOWN_DOCUMENT'],
    ['read_document', { doc_id: 'spec', section_id: 'unknown' }, 'UNKNOWN_SECTION'],
    ['propose_field', { ...good, field_id: 'unknown' }, 'UNKNOWN_FIELD'],
    ['propose_field', { ...good, value: 42 }, 'SCHEMA'],
    ['propose_field', { ...good, source_refs: [] }, 'NO_SOURCE_REF'],
    ['propose_field', { ...good, source_refs: ['bad'] }, 'INVALID_SOURCE_REF'],
    ['propose_field', { ...good, field_id: 'quantity', value: '1.5' }, 'SCHEMA'],
    ['propose_field', { ...good, unit: 'mm' }, 'SCHEMA'],
    ['report_missing', { field_id: 'delivery', searched: [] }, 'SCHEMA'],
    ['report_missing', { field_id: 'delivery', searched: ['bad'] }, 'INVALID_SOURCE_REF'],
  ] as const) expect(await executeTool(name, input)).toMatchObject({ ok: false, code });
  expect(await executeTool('propose_field', good)).toEqual({ ok: true, field_id: 'material', state: 'needs_review', value: '6061' });
  expect(await executeTool('read_document', { doc_id: 'spec', section_id: 's1' })).toMatchObject({ doc_id: 'spec', section_id: 's1', regions: expect.any(Array) });
  expect(await executeTool('list_rfq_documents', {})).toHaveProperty('documents');
  const { getState } = await import('./state/store');
  expect((getState() as { log?: unknown[] }).log).toHaveLength(13);
});
