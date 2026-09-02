import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.resetModules(); });

test('readSavedSession reads without mutation; saveNow saves compact state unless suspended', async () => {
  const { readSavedSession, saveNow, suspendPersistence, resumePersistence } = await import('./persistence');
  const storage = { getItem: vi.fn(() => 'saved session'), setItem: vi.fn() };
  expect(readSavedSession(storage)).toBe('saved session');
  expect(storage.setItem).not.toHaveBeenCalled();
  suspendPersistence();
  saveNow(storage);
  expect(storage.setItem).not.toHaveBeenCalled();
  resumePersistence();
  saveNow(storage);
  expect(storage.setItem).toHaveBeenCalledOnce();
  const [key, value] = storage.setItem.mock.calls[0]!;
  expect(key).toBe('spotcheck.session.v1');
  expect(value).not.toContain('\n');
  expect(JSON.parse(value)).toHaveProperty('steps', []);
});

test('unavailable storage is contained by snapshot and immediate save', async () => {
  const { readSavedSession, saveNow } = await import('./persistence');
  const storage = { getItem: () => { throw new Error('Denied'); }, setItem: () => { throw new Error('Quota'); } };
  expect(readSavedSession(storage)).toBeNull();
  expect(() => saveNow(storage)).not.toThrow();
});
