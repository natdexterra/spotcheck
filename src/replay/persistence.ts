import { subscribe } from '../state/store';
import { exportSession, importSession } from './serialization';

interface SessionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const key = 'spotcheck.session.v1';

/** Restore before subscribing, so intermediate replay states never overwrite the saved log. */
export async function startPersistence(storage?: SessionStorage) {
  let error: string | undefined;
  let restored = false;
  try {
    storage ??= globalThis.localStorage;
    const saved = storage?.getItem(key);
    if (saved) { await importSession(saved); restored = true; }
  } catch (cause) { error = cause instanceof Error ? cause.message : 'Session storage is unavailable.'; }
  const stop = subscribe(() => {
    try { storage?.setItem(key, exportSession()); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Session could not be saved.'; }
  });
  return { restored, get error() { return error; }, stop };
}
