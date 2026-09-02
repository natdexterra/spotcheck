import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.resetModules(); });

test('readSavedSession reads without mutation; saveNow saves compact state unless suspended', async () => {
  const { readSavedSession, saveNow, suspendPersistence, resumePersistence } = await import('./persistence');
  const { sessionKey } = await import('../data/package-storage');
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
  expect(key).toBe(sessionKey());
  expect(value).not.toContain('\n');
  expect(JSON.parse(value)).toHaveProperty('steps', []);
});

test('unavailable storage is contained by snapshot and immediate save', async () => {
  const { readSavedSession, saveNow } = await import('./persistence');
  const storage = { getItem: () => { throw new Error('Denied'); }, setItem: () => { throw new Error('Quota'); } };
  expect(readSavedSession(storage)).toBeNull();
  expect(() => saveNow(storage)).not.toThrow();
});

test('P5: the session key belongs to the package under it, and can be cleared', async () => {
  const { clearSavedSession, saveNow } = await import('./persistence');
  const { sessionKey } = await import('../data/package-storage');
  const { buildPackage } = await import('../data/user-package');
  const { getPackage, samplePackage, setPackage } = await import('../data/package');
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  try {
    saveNow(storage);
    expect([...values.keys()]).toEqual([sessionKey(samplePackage)]);

    setPackage(buildPackage({ reference: 'RFQ 91-2201', email: 'Subject\n\nBody.' }));
    saveNow(storage);
    expect(values.size).toBe(2);
    expect(values.has(sessionKey(getPackage()))).toBe(true);

    clearSavedSession(storage);
    expect(values.has(sessionKey(getPackage()))).toBe(false);
    expect(values.has(sessionKey(samplePackage))).toBe(true);
  } finally {
    setPackage(samplePackage);
  }
});
