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
  const broken = await startPersistence({ getItem: () => '{broken', setItem: () => {} });
  expect(broken.error).toBeTruthy();
  expect(getState()).toEqual(saved);
  broken.stop();
  const denied = await startPersistence({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
  await expect(executeTool('get_review_state', {})).resolves.toHaveProperty('fields');
  expect(denied.error).toBeTruthy();
  denied.stop();
});
