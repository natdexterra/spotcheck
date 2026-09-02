// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';

afterEach(async () => { const controller = await import('./controller'); await controller.leave(); localStorage.clear(); vi.restoreAllMocks(); vi.resetModules(); });

test('start snapshots live storage; leave restores state, saves once, and resumes persistence', async () => {
  const { startPersistence } = await import('./persistence');
  const { startSample, leave, getSnapshot, next } = await import('./controller');
  const { dispatchHuman, getState } = await import('../state/store');
  const persistence = await startPersistence();
  dispatchHuman({ type: 'enter', field_id: 'material', value: 'live steel', at: 40 });
  const before = structuredClone(getState());
  const saved = localStorage.getItem('spotcheck.session.v1');
  await startSample();
  expect(getSnapshot()).toMatchObject({ active: true, playing: true, position: 0 });
  await next();
  expect(localStorage.getItem('spotcheck.session.v1')).toBe(saved);
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await leave();
  expect(getState()).toEqual(before);
  expect(writes).toHaveBeenCalledOnce();
  expect(localStorage.getItem('spotcheck.session.v1')).toBe(saved);
  expect(getSnapshot().active).toBe(false);
  dispatchHuman({ type: 'enter', field_id: 'quantity', value: '5' });
  expect(writes).toHaveBeenCalledTimes(2);
  persistence.stop();
});

test('empty snapshot leaves initial state; starting another replay preserves original live snapshot', async () => {
  const { startSample, startImported, leave, getSnapshot, next } = await import('./controller');
  const { getState } = await import('../state/store');
  const { createInitialState } = await import('../state/session');
  await startSample(); await next();
  await startImported({ recorded_at: '2026-09-02', steps: [] }, 'Imported session');
  expect(getSnapshot()).toMatchObject({ active: true, label: 'Imported session', ended: true, total: 0 });
  await leave();
  expect(getState()).toEqual(createInitialState());
});

test('snapshot identity stays stable until a replay changes', async () => {
  const { getSnapshot, startSample, pause, subscribe } = await import('./controller');
  expect(getSnapshot()).toBe(getSnapshot());
  const changed = vi.fn(); const unsubscribe = subscribe(changed);
  await startSample(); pause();
  expect(changed).toHaveBeenCalled();
  expect(getSnapshot()).toBe(getSnapshot());
  unsubscribe();
});
