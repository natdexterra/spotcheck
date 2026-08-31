import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

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
  const { roster, context } = modelContext();
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
  for (const [, options] of context.registerTool.mock.calls) expect(options?.signal).toBeInstanceOf(AbortSignal);
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

test('suggestions require valid provenance; equal value agrees; locked reports only add valid notes', async () => {
  const { executeTool } = await import('./webmcp-tools');
  const { dispatchHuman, getState } = await import('./state/store');
  const { reviewSession } = await import('./state/session');
  dispatchHuman({ type: 'enter', field_id: 'material', value: 'human steel' });
  const before = structuredClone(getState().fields.find(f => f.id === 'material'));
  const proposal = { field_id: 'material', value: 'aluminum', source_refs: ['spec:s3.1'] };
  for (const source_refs of [[], ['bad']]) {
    expect(await executeTool('propose_field', { ...proposal, source_refs })).toMatchObject({ code: 'FIELD_LOCKED', suggestion_recorded: false });
    expect(getState().fields.find(f => f.id === 'material')).toEqual(before);
  }
  expect(await executeTool('propose_field', proposal)).toMatchObject({ code: 'FIELD_LOCKED', suggestion_recorded: true, current: { value: 'human steel', state: 'verified', resolution: 'entered' } });
  const suggested = getState().fields.find(f => f.id === 'material')!;
  expect(suggested.suggestion).toMatchObject({ value: 'aluminum', source_refs: ['spec:s3.1'] });
  const { suggestion: _suggestion, ...decision } = suggested;
  expect(decision).toEqual(before);
  expect(await executeTool('propose_field', { ...proposal, value: 'human steel' })).toMatchObject({ suggestion_recorded: false });
  expect(getState().fields.find(f => f.id === 'material')?.suggestion).toEqual(suggested.suggestion);
  expect(reviewSession(getState()).log.at(-1)?.notes).toContain('agent independently agrees');
  await executeTool('report_missing', { field_id: 'material', searched: ['spec'], note: 'looked again' });
  expect(reviewSession(getState()).log.at(-1)?.notes).toContain('looked again');
  await executeTool('report_missing', { field_id: 'material', searched: [], note: 'invalid note' });
  expect(reviewSession(getState()).log.at(-1)?.notes).toBeUndefined();
});

test('draft covers reject unknown ids, filter nongaps and echo only the accepted subset', async () => {
  const { executeTool } = await import('./webmcp-tools');
  const { getState } = await import('./state/store');
  const { reviewSession } = await import('./state/session');
  await executeTool('report_missing', { field_id: 'drawing_number', searched: ['drawing'] });
  const draft = { subject: 'Question', body: 'Please supply the drawing number.', covers: ['drawing_number', 'material', 'drawing_number'] };
  expect(await executeTool('draft_clarification', { ...draft, covers: ['unknown'] })).toMatchObject({ code: 'UNKNOWN_FIELD' });
  expect(await executeTool('draft_clarification', draft)).toEqual({ ok: true, opened: true, covers: ['drawing_number'] });
  expect(reviewSession(getState()).draft).toEqual({ ...draft, covers: ['drawing_number'] });
});

test('fixture output budgets, read provenance/privacy, S4 units and quiet injection filtering', async () => {
  const { executeTool } = await import('./webmcp-tools');
  const { packageData } = await import('./data/package');
  const { dispatchHuman, getState } = await import('./state/store');
  const check = (result: unknown) => expect(JSON.stringify(result).length).toBeLessThan(1500);
  check(await executeTool('list_rfq_documents', {}));
  for (const doc of packageData.documents) for (const section of doc.sections) {
    const result = await executeTool('read_document', { doc_id: doc.id, section_id: section.id });
    check(result);
    expect(JSON.stringify(result)).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/i);
    expect(result).not.toHaveProperty('units_note', null);
  }
  const fixture = JSON.parse(readFileSync('data/sample-session.json', 'utf8'));
  for (const step of fixture.steps) {
    if (step.actor === 'agent') check(await executeTool(step.call.tool, step.call.input, step.at));
    else dispatchHuman({ ...step.action, at: step.at });
    check(await executeTool('get_review_state', {}));
  }
  expect(getState().confirmed).toBe(true);
  const { replaceState } = await import('./state/store');
  const { createInitialState } = await import('./state/session');
  replaceState(createInitialState());
  const dims = { field_id: 'overall_dimensions', value: '20 × 14.5', source_refs: ['drawing:width'] };
  expect(await executeTool('propose_field', dims)).toMatchObject({ ok: true, state: 'needs_review' });
  dispatchHuman({ type: 'verify', field_id: 'overall_dimensions' });
  expect(getState().fields.find(f => f.id === 'overall_dimensions')?.state).toBe('needs_review');
  dispatchHuman({ type: 'edit', field_id: 'overall_dimensions', value: dims.value, unit: 'in' });
  expect(getState().fields.find(f => f.id === 'overall_dimensions')?.state).toBe('verified');
  vi.stubGlobal('location', { search: '?quiet=1' });
  expect(JSON.stringify(await executeTool('read_document', { doc_id: 'email', section_id: 'body' }))).not.toContain('ignore previous instructions');
});

test('draft lifecycle: gap roster changes, idempotent registration and abort waits for pending calls', async () => {
  vi.useFakeTimers();
  const { roster, events } = modelContext();
  const { registerTools, executeTool } = await import('./webmcp-tools');
  registerTools();
  expect(events).toHaveLength(6);
  const { dispatchHuman } = await import('./state/store');
  await executeTool('report_missing', { field_id: 'drawing_number', searched: ['drawing'] });
  expect(roster.size).toBe(7);
  const draft = roster.get('draft_clarification')!;
  expect(readFileSync('build-spec.md', 'utf8')).toContain('> ' + draft.description);
  // execute returns a pending Promise; the synchronous human event closes the last gap before it settles.
  const pending = draft.execute({ subject: 'Question', body: 'Number?', covers: ['drawing_number'] });
  let settled = false;
  void pending.then(() => { settled = true; });
  const registration = (document.modelContext!.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(([tool]) => tool.name === 'draft_clarification')!;
  let settledWhenAborted: boolean | undefined;
  registration[1].signal.addEventListener('abort', () => { settledWhenAborted = settled; });
  dispatchHuman({ type: 'dismiss', field_id: 'drawing_number', reason: 'Not required' });
  expect(roster.has('draft_clarification')).toBe(true);
  await pending;
  await vi.runAllTimersAsync();
  expect(settledWhenAborted).toBe(true);
  expect(roster.size).toBe(6);
  await executeTool('report_missing', { field_id: 'delivery', searched: ['email'] });
  expect(roster.size).toBe(7);
  dispatchHuman({ type: 'dismiss', field_id: 'delivery', reason: 'Not required' });
  expect(roster.size).toBe(6);
});

test('registration is top-level only and unsupported browsers remain usable', async () => {
  const { roster } = modelContext();
  vi.stubGlobal('window', { top: {} });
  await import('./webmcp-tools');
  expect(roster.size).toBe(0);
});

test('malformed values never throw; all seven tool results in the hand stub fit the budget', async () => {
  const { executeTool } = await import('./webmcp-tools');
  const { dispatchHuman } = await import('./state/store');
  for (const input of [null, [], {}, 42, 'text']) for (const tool of ['propose_field', 'report_conflict', 'report_missing', 'draft_clarification', 'read_document'] as const)
    await expect(executeTool(tool, input)).resolves.toMatchObject({ ok: false });
  for (const step of JSON.parse(readFileSync('data/sample-session.stub.json', 'utf8')).steps) {
    if (step.actor === 'agent') expect(JSON.stringify(await executeTool(step.call.tool, step.call.input, step.at)).length).toBeLessThan(1500);
    else dispatchHuman({ ...step.action, at: step.at });
    expect(JSON.stringify(await executeTool('get_review_state', {})).length).toBeLessThan(1500);
  }
});
