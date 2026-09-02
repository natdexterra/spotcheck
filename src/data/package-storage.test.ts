import { afterEach, describe, expect, test, vi } from 'vitest';
import { getPackage, samplePackage, setPackage } from './package';
import {
  PACKAGE_KEY, clearUserPackage, restorePackage, saveUserPackage, sessionKey,
} from './package-storage';
import { buildPackage } from './user-package';

const user = buildPackage({
  reference: 'RFQ 91-2201',
  customer: 'Ridgeway Panels',
  email: 'Bay cover quote\n\nPlease quote 240 covers.',
  drawing: 'data:image/webp;base64,AAAA',
});

const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

afterEach(() => setPackage(samplePackage));

describe('the package a person opened', () => {
  test('is saved and comes back on the next visit, image and all', () => {
    const storage = memory();
    expect(saveUserPackage(user, storage)).toBe(true);
    expect(storage.values.has(PACKAGE_KEY)).toBe(true);

    expect(restorePackage(storage)).toBe(true);
    expect(getPackage().reference).toBe('RFQ 91-2201');
    expect(getPackage().documents.find(doc => doc.id === 'drawing')?.image).toBe('data:image/webp;base64,AAAA');
  });

  test('is left alone when nothing was saved', () => {
    expect(restorePackage(memory())).toBe(false);
    expect(getPackage()).toBe(samplePackage);
  });

  test('does not survive as half a package: unreadable storage falls back to the sample', () => {
    const storage = memory();
    storage.setItem(PACKAGE_KEY, '{ not json');

    expect(restorePackage(storage)).toBe(false);
    expect(getPackage()).toBe(samplePackage);
    expect(storage.values.has(PACKAGE_KEY)).toBe(false);
  });

  test('is removed when the sample is chosen again', () => {
    const storage = memory();
    saveUserPackage(user, storage);
    clearUserPackage(storage);

    expect(storage.values.has(PACKAGE_KEY)).toBe(false);
  });

  test('a browser with no room keeps nothing half written and says so', () => {
    const storage = { ...memory(), setItem: () => { throw new Error('QuotaExceededError'); } };
    const removed = vi.spyOn(storage, 'removeItem');

    expect(saveUserPackage(user, storage)).toBe(false);
    expect(removed).toHaveBeenCalledWith(PACKAGE_KEY);
  });
});

describe('the session key', () => {
  test('carries the package it belongs to, so two packages never share a session', () => {
    const sample = sessionKey(samplePackage);
    const mine = sessionKey(user);

    expect(sample).toMatch(/^spotcheck\.session\.v1\.[0-9a-z]+$/);
    expect(mine).not.toBe(sample);
  });

  test('is stable for the same document text and moves with a change to it', () => {
    const same = buildPackage({ reference: 'Another reference', email: 'Bay cover quote\n\nPlease quote 240 covers.' });
    const changed = buildPackage({ reference: 'RFQ 91-2201', email: 'Bay cover quote\n\nPlease quote 241 covers.' });

    expect(sessionKey(same)).toBe(sessionKey(buildPackage({
      reference: 'RFQ 91-2201', email: 'Bay cover quote\n\nPlease quote 240 covers.',
    })));
    expect(sessionKey(changed)).not.toBe(sessionKey(same));
  });

  test('answers for the current package when it is not given one', () => {
    setPackage(user);
    expect(sessionKey()).toBe(sessionKey(user));
  });
});
