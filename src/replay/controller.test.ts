// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';

afterEach(async () => { const controller = await import('./controller'); await controller.leave(); localStorage.clear(); vi.restoreAllMocks(); vi.resetModules(); });

test('malformed saved data cannot wedge leave or be overwritten by the sample', async () => {
  const { startSample, leave, next, getSnapshot } = await import('./controller');
  const { startPersistence } = await import('./persistence');
  const { getState } = await import('../state/store');
  localStorage.setItem('spotcheck.session.v1', '{recoverable');
  const persistence = await startPersistence();
  const before = getState();
  await startSample(); await next();
  await expect(leave()).resolves.toBeUndefined();
  expect(getSnapshot().active).toBe(false);
  expect(getState()).toEqual(before);
  expect(localStorage.getItem('spotcheck.session.v1')).toBe('{recoverable');
  persistence.stop();
});

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

test('P5: the sample replay switches to the sample package and hands the user package back on leave', async () => {
  const { startSample, leave, getSnapshot, next } = await import('./controller');
  const { getPackage, samplePackage, setPackage } = await import('../data/package');
  const { buildPackage } = await import('../data/user-package');
  const { getState } = await import('../state/store');
  const { reviewSession } = await import('../state/session');
  const user = buildPackage({ reference: 'RFQ 91-2201', email: 'Subject\n\nOne paragraph.' });
  setPackage(user);

  await startSample();
  expect(getPackage()).toBe(samplePackage);
  // The recording cites the sample's own regions, so none of its steps may be
  // rejected while it runs: the package under it is the one it was recorded on.
  for (let step = 0; step < 8 && !getSnapshot().ended; step += 1) await next();
  expect(reviewSession(getState()).log.filter(entry => entry.result?.ok === false)).toEqual([]);

  await leave();
  expect(getPackage()).toBe(user);
  setPackage(samplePackage);
});
