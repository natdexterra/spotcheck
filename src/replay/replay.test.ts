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
