import { createInitialState } from '../state/session';
import { replaceState } from '../state/store';
import { readSavedSession, saveNow } from './persistence';
import { createReplay, sampleSession, type Fixture, type Step } from './replay';
import { importSession, parseFixture } from './serialization';

export interface ReplaySnapshot {
  active: boolean;
  label: string;
  recordedAt: string;
  position: number;
  total: number;
  playing: boolean;
  busy: boolean;
  ended: boolean;
  error?: string;
  next?: Step;
  finishedByViewer: boolean;
  recordedMs: number;
}

const idle: ReplaySnapshot = { active: false, label: '', recordedAt: '', position: 0, total: 0,
  playing: false, busy: false, ended: false, finishedByViewer: false, recordedMs: 0 };
let snapshot = idle;
let owner: { replay: ReturnType<typeof createReplay>; saved: string | null; label: string; recordedAt: string; unsubscribe: () => void } | undefined;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;
const publish = () => {
  if (!owner) snapshot = idle;
  else {
    const { replay, label, recordedAt } = owner;
    snapshot = { active: true, label, recordedAt, position: replay.position, total: replay.total,
      playing: replay.playing, busy: replay.busy, ended: replay.ended, error: replay.error,
      next: replay.nextStep, finishedByViewer: replay.finishedByViewer, recordedMs: replay.recordedMs };
  }
  listeners.forEach(listener => listener());
};

// Serialize transitions so a slow in-flight tool settles before restoring or replacing its store.
let transition = Promise.resolve();
const enqueue = (operation: () => Promise<void>) => {
  const result = transition.then(operation);
  transition = result.catch(() => {});
  return result;
};
async function detach() {
  if (!owner) return;
  const previous = owner;
  previous.replay.pause();
  if (previous.replay.busy) await new Promise<void>(resolve => {
    const stop = previous.replay.subscribe(() => { if (!previous.replay.busy) { stop(); resolve(); } });
  });
  if (previous.saved) await importSession(previous.saved);
  else replaceState(createInitialState());
  previous.unsubscribe();
  previous.replay.dispose();
  saveNow(undefined, previous.saved ? parseFixture(previous.saved).recorded_at : undefined);
  owner = undefined;
  publish();
}

export const leave = () => enqueue(detach);
export const startImported = (fixture: Fixture, label = 'Imported session') => {
  // Reject malformed input before touching the attached replay or its saved session.
  const validated = parseFixture(JSON.stringify(fixture));
  return enqueue(async () => {
    await detach();
    const saved = readSavedSession();
    const replay = createReplay(validated);
    owner = { replay, saved, label, recordedAt: validated.recorded_at, unsubscribe: replay.subscribe(publish) };
    replay.play();
    publish();
  });
};
export const startSample = () => startImported(sampleSession, 'Sample session');
export const play = () => owner?.replay.play();
export const pause = () => owner?.replay.pause();
export const next = async () => await owner?.replay.next() ?? false;
export const restart = () => owner?.replay.restart();
