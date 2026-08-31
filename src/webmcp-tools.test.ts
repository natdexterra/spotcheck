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

test('rejection precedence: confirmed > locked > conflict > input; no silent merging', async () => {
  const { executeTool } = await import('./webmcp-tools');
  const { dispatchHuman, getState, replaceState } = await import('./state/store');
  const good = { field_id: 'quantity', value: '800', source_refs: ['spec:s1.1'] };
  await executeTool('propose_field', good);
  const other = { value: '750', source_refs: ['email:p2'], note: 'private rationale' };
  const single = await executeTool('report_conflict', { field_id: 'quantity', candidates: [other] });
  expect(single).toMatchObject({ ok: false, code: 'SCHEMA', path: 'candidates' });
  expect(single.message).toContain('800 (spec:s1.1)');
  expect(await executeTool('report_conflict', { field_id: 'quantity', candidates: [{ value: '799', source_refs: ['spec:s1.1'] }, other] })).toMatchObject({ code: 'SCHEMA' });
  await executeTool('report_conflict', { field_id: 'quantity', candidates: [good, other] });
  const conflict = await executeTool('propose_field', { ...good, source_refs: [] });
  expect(conflict).toMatchObject({ code: 'FIELD_IN_CONFLICT' });
  expect(JSON.stringify(conflict)).not.toContain('private rationale');
  expect(await executeTool('report_missing', { field_id: 'quantity', searched: [] })).toMatchObject({ code: 'FIELD_IN_CONFLICT' });
  dispatchHuman({ type: 'edit_start', field_id: 'quantity' });
  expect(await executeTool('propose_field', { ...good, source_refs: [] })).toMatchObject({ code: 'FIELD_LOCKED', suggestion_recorded: false });
  const frozen = { ...getState(), confirmed: true };
  replaceState(frozen);
  for (const tool of ['propose_field', 'report_conflict', 'report_missing', 'draft_clarification'] as const) {
    expect(await executeTool(tool, null)).toMatchObject({ code: 'SESSION_CONFIRMED' });
    expect(getState()).toBe(frozen);
  }
  expect(await executeTool('get_review_state', {})).toHaveProperty('confirmed', true);
});
