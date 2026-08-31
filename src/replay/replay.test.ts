import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';

afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

test('sample and hand stub replay through tool/human dispatchers to confirmed without WebMCP', async () => {
  const { createReplay } = await import('./replay');
  const { getState } = await import('../state/store');
  for (const path of ['data/sample-session.json', 'data/sample-session.stub.json']) {
    const fixture = JSON.parse(readFileSync(path, 'utf8'));
    const replay = createReplay(fixture);
    while (await replay.next()) { /* deterministic manual stepping */ }
    expect(getState().confirmed).toBe(true);
    expect(getState().fields).toHaveLength(11);
    expect(getState().fields.every(f => f.state === 'verified')).toBe(true);
    replay.dispose();
  }
});

test('play/pause/next/restart honor agent 900ms and estimator 1500ms cadence', async () => {
  vi.useFakeTimers();
  const { createReplay } = await import('./replay');
  const { getState } = await import('../state/store');
  const { reviewSession } = await import('../state/session');
  const replay = createReplay({ recorded_at: 'test', steps: [
    { actor: 'agent', at: 10, call: { tool: 'propose_field', input: { field_id: 'material', value: 'steel', source_refs: ['spec:s1.1'] } } },
    { actor: 'estimator', at: 20, action: { type: 'verify', field_id: 'material' } },
  ] });
  replay.play();
  await vi.advanceTimersByTimeAsync(899);
  expect(reviewSession(getState()).log).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(reviewSession(getState()).log).toHaveLength(1);
  replay.pause();
  await vi.advanceTimersByTimeAsync(2000);
  expect(reviewSession(getState()).log).toHaveLength(1);
  replay.play();
  await vi.advanceTimersByTimeAsync(1499);
  expect(reviewSession(getState()).log).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(getState().fields.find(f => f.id === 'material')?.state).toBe('verified');
  replay.restart();
  expect(reviewSession(getState()).log).toHaveLength(0);
  expect(replay.position).toBe(0);
  await replay.next();
  expect(replay.position).toBe(1);
  replay.dispose();
});

test('D14: viewer overrides skip fixture estimator actions and log; agent steps still reject for real', async () => {
  const { createReplay } = await import('./replay');
  const { dispatchHuman, getState } = await import('../state/store');
  const { reviewSession } = await import('../state/session');
  const proposal = { tool: 'propose_field' as const, input: { field_id: 'material', value: 'steel', source_refs: ['spec:s1.1'] } };
  const replay = createReplay({ recorded_at: 'test', steps: [
    { actor: 'agent', at: 1, call: proposal },
    { actor: 'estimator', at: 2, action: { type: 'edit', field_id: 'material', value: 'fixture choice' } },
    { actor: 'agent', at: 3, call: proposal },
  ] });
  await replay.next();
  dispatchHuman({ type: 'edit_start', field_id: 'material', at: 10 });
  dispatchHuman({ type: 'edit', field_id: 'material', value: 'viewer choice', at: 11 });
  await replay.next();
  expect(getState().fields.find(f => f.id === 'material')?.value).toBe('viewer choice');
  expect(reviewSession(getState()).log.at(-1)?.notes?.join(' ')).toContain('Skipped fixture step');
  await replay.next();
  expect(reviewSession(getState()).log.at(-1)?.result).toMatchObject({ code: 'FIELD_LOCKED', suggestion_recorded: true });
  replay.dispose();
  const fixtureOnly = createReplay({ recorded_at: 'test', steps: [
    { actor: 'agent', at: 1, call: proposal },
    { actor: 'estimator', at: 2, action: { type: 'verify', field_id: 'material' } },
    { actor: 'estimator', at: 3, action: { type: 'reopen', field_id: 'material' } },
  ] });
  while (await fixtureOnly.next()) { /* previous fixture locks are not viewer overrides */ }
  expect(getState().fields.find(f => f.id === 'material')?.state).toBe('needs_review');
  fixtureOnly.dispose();
});

test('B8: export/import preserves entire final state including rejections, skips, diffs and times', async () => {
  const { createReplay } = await import('./replay');
  const { exportSession, importSession } = await import('./serialization');
  const { getState, dispatchHuman } = await import('../state/store');
  const fixture = JSON.parse(readFileSync('data/sample-session.stub.json', 'utf8'));
  const replay = createReplay(fixture);
  await replay.next();
  dispatchHuman({ type: 'edit', field_id: 'material', value: 'viewer choice', at: 42 });
  while (await replay.next()) { /* include viewer skip and actual locked rejections */ }
  replay.dispose();
  const before = structuredClone(getState());
  const exported = exportSession('2026-08-31');
  expect(JSON.parse(exported)).toMatchObject({ recorded_at: '2026-08-31', steps: expect.any(Array) });
  await importSession(exported);
  expect(getState()).toEqual(before);
  const unchanged = getState();
  await expect(importSession('{"recorded_at":"bad","steps":[{"actor":"agent","call":{"tool":"verify"}}]}')).rejects.toThrow();
  expect(getState()).toBe(unchanged);
});

test('persistence saves the log and replays on load; denied storage and malformed data are contained', async () => {
  const { startPersistence } = await import('./persistence');
  const { executeTool } = await import('../webmcp-tools');
  const { getState, replaceState } = await import('../state/store');
  const { createInitialState } = await import('../state/session');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = await startPersistence(storage);
  await executeTool('propose_field', { field_id: 'material', value: 'steel', source_refs: ['spec:s1.1'] }, 25);
  const saved = structuredClone(getState());
  first.stop();
  replaceState(createInitialState());
  const restored = await startPersistence(storage);
  expect(restored.restored).toBe(true);
  expect(getState()).toEqual(saved);
  restored.stop();
  const saveBroken = vi.fn();
  const broken = await startPersistence({ getItem: () => '{broken', setItem: saveBroken });
  expect(broken.error).toBeTruthy();
  expect(getState()).toEqual(saved);
  await executeTool('get_review_state', {});
  expect(saveBroken).not.toHaveBeenCalled();
  broken.stop();
  const denied = await startPersistence({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
  await expect(executeTool('get_review_state', {})).resolves.toHaveProperty('fields');
  expect(denied.error).toBeTruthy();
  denied.stop();
});

test('B8 preserves default human timestamps and rejected null tool input', async () => {
  const { executeTool } = await import('../webmcp-tools');
  const { dispatchHuman, getState } = await import('../state/store');
  const { exportSession, importSession } = await import('./serialization');
  await executeTool('propose_field', null, 1);
  await executeTool('list_rfq_documents', undefined, 2);
  dispatchHuman({ type: 'enter', field_id: 'material', value: 'steel' });
  const before = structuredClone(getState());
  await importSession(exportSession());
  expect(getState()).toEqual(before);
});

test('P1.1 replay: a partially viewer-covered send resolves the remaining fields and still confirms', async () => {
  const { createReplay } = await import('./replay');
  const { dispatchHuman, getState } = await import('../state/store');
  const { reviewSession } = await import('../state/session');
  const fixture = JSON.parse(readFileSync('data/sample-session.stub.json', 'utf8'));
  const sendIndex = fixture.steps.findIndex((step: { action?: { type?: string } }) => step.action?.type === 'send');
  expect(sendIndex).toBeGreaterThan(0);
  const replay = createReplay(fixture);
  while (replay.position < sendIndex) await replay.next();
  dispatchHuman({ type: 'dismiss', field_id: 'drawing_number', reason: 'Not required', at: 27500 });
  while (await replay.next()) { /* run the send and the confirm */ }
  const fields = getState().fields;
  expect(fields.find(f => f.id === 'general_tolerance')?.resolution?.kind).toBe('asked_customer');
  expect(fields.find(f => f.id === 'drawing_revision')?.resolution?.kind).toBe('asked_customer');
  expect(fields.find(f => f.id === 'drawing_number')?.resolution?.kind).toBe('dismissed');
  const notes = reviewSession(getState()).log.flatMap(entry => entry.notes ?? []);
  expect(notes).toContain('Skipped fixture step: viewer handled drawing_number');
  expect(reviewSession(getState()).sent?.covers).toEqual(['general_tolerance', 'drawing_revision']);
  expect(getState().confirmed).toBe(true);
  replay.dispose();
});

test('P1.1 replay: a viewer no-op on a fixture-locked field does not suppress later fixture steps', async () => {
  const { createReplay } = await import('./replay');
  const { dispatchHuman, getState } = await import('../state/store');
  const replay = createReplay({ recorded_at: 'test', steps: [
    { actor: 'agent', at: 1, call: { tool: 'propose_field', input: { field_id: 'material', value: 'steel', source_refs: ['spec:s1.1'] } } },
    { actor: 'estimator', at: 2, action: { type: 'verify', field_id: 'material' } },
    { actor: 'estimator', at: 3, action: { type: 'reopen', field_id: 'material' } },
  ] });
  await replay.next();
  await replay.next();
  expect(getState().fields.find(f => f.id === 'material')?.state).toBe('verified');
  // The viewer verifies an already-verified fixture-locked field: logged, but no state change.
  dispatchHuman({ type: 'verify', field_id: 'material', at: 10 });
  expect(getState().fields.find(f => f.id === 'material')?.resolution?.at).toBe(2);
  await replay.next();
  expect(getState().fields.find(f => f.id === 'material')?.state).toBe('needs_review');
  replay.dispose();
});

test('P1.1 persistence: a replay suspends saves; the stored live session survives byte-identical', async () => {
  const { startPersistence } = await import('./persistence');
  const { createReplay } = await import('./replay');
  const { dispatchHuman } = await import('../state/store');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const session = await startPersistence(storage);
  dispatchHuman({ type: 'enter', field_id: 'material', value: 'viewer choice', at: 5 });
  const saved = values.get('spotcheck.session.v1');
  expect(saved).toBeTruthy();
  const replay = createReplay({ recorded_at: 'test', steps: [
    { actor: 'agent', at: 1, call: { tool: 'propose_field', input: { field_id: 'material', value: 'steel', source_refs: ['spec:s1.1'] } } },
  ] });
  await replay.next();
  replay.restart();
  expect(values.get('spotcheck.session.v1')).toBe(saved);
  replay.dispose();
  dispatchHuman({ type: 'enter', field_id: 'quantity', value: '800', at: 6 });
  expect(values.get('spotcheck.session.v1')).not.toBe(saved);
  session.stop();
});

test('P1.1 replay: createReplay validates its fixture through parseFixture', async () => {
  const { createReplay } = await import('./replay');
  const bad = { recorded_at: 'test', steps: [{ actor: 'agent', at: 1, call: { tool: 'not_a_tool', input: {} } }] };
  expect(() => createReplay(bad as never)).toThrow(/fixture step 0/i);
  expect(() => createReplay({ steps: [] } as never)).toThrow();
});
