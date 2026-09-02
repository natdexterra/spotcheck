import { sessionKey } from '../data/package-storage';
import { subscribe } from '../state/store';
import { exportSession, importSession } from './serialization';

interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

// The key is read at every call, never captured: it carries a hash of the
// package under the session, so opening another package moves the session with
// it and a sample session and a person's own session never overwrite each
// other (src/data/package-storage.ts).

// While a replay owns the store, its replaceState/step notifies must not
// overwrite the viewer's saved live session. Replay acquires on creation and
// releases on teardown; saving resumes with the next notify after release.
let suspensions = 0;
export function suspendPersistence(): void { suspensions++; }
export function resumePersistence(): void { suspensions = Math.max(0, suspensions - 1); }

export function readSavedSession(storage?: SessionStorage): string | null {
  try { return (storage ?? globalThis.localStorage)?.getItem(sessionKey()) ?? null; }
  catch { return null; }
}

export function saveNow(storage?: SessionStorage, recordedAt?: string): void {
  if (suspensions > 0) return;
  try { (storage ?? globalThis.localStorage)?.setItem(sessionKey(), exportSession(recordedAt)); }
  catch { /* Storage can be unavailable; the session remains in memory. */ }
}

/** Forgets the saved session of the package that is open: leaving a replay, and opening another package. */
export function clearSavedSession(storage?: SessionStorage): void {
  try { (storage ?? globalThis.localStorage)?.removeItem?.(sessionKey()); }
  catch { /* Storage can be unavailable; nothing was saved then either. */ }
}

/** Restore before subscribing, so intermediate replay states never overwrite the saved log. */
export async function startPersistence(storage?: SessionStorage) {
  let error: string | undefined;
  let restored = false;
  try {
    storage ??= globalThis.localStorage;
    const saved = storage?.getItem(sessionKey());
    if (saved) { await importSession(saved); restored = true; }
  } catch (cause) { error = cause instanceof Error ? cause.message : 'Session storage is unavailable.'; }
  // A restore error may contain a recoverable session. Do not overwrite it with a fresh log.
  const stop = error ? () => {} : subscribe(() => {
    if (suspensions > 0) return;
    try { storage?.setItem(sessionKey(), exportSession()); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Session could not be saved.'; }
  });
  return { restored, get error() { return error; }, stop };
}
