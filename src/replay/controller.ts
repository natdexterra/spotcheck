import { getPackage, samplePackage, setPackage, type RfqPackage } from '../data/package';
import { createInitialState } from '../state/session';
import { getState, replaceState } from '../state/store';
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
  /** Bumped by `focusPause()`; the replay row focuses itself when it changes. */
  focusRequest: number;
}

const idle: Omit<ReplaySnapshot, 'focusRequest'> = { active: false, label: '', recordedAt: '', position: 0, total: 0,
  playing: false, busy: false, ended: false, finishedByViewer: false, recordedMs: 0 };
let focusRequest = 0;
let snapshot: ReplaySnapshot = { ...idle, focusRequest };
let owner: { replay: ReturnType<typeof createReplay>; saved: string | null; before: ReturnType<typeof getState>; pkg: RfqPackage; label: string; recordedAt: string; unsubscribe: () => void } | undefined;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;
const publish = () => {
  if (!owner) snapshot = { ...idle, focusRequest };
  else {
    const { replay, label, recordedAt } = owner;
    snapshot = { active: true, label, recordedAt, position: replay.position, total: replay.total,
      playing: replay.playing, busy: replay.busy, ended: replay.ended, error: replay.error,
      next: replay.nextStep, finishedByViewer: replay.finishedByViewer, recordedMs: replay.recordedMs,
      focusRequest };
  }
  listeners.forEach(listener => listener());
};

// Hands the keyboard back to the replay row after a component elsewhere started
// a replay (the log drawer, on import and on Play sample session). The row owns
// its own DOM: it focuses Pause, or Restart when an ended or errored row has no
// Pause. Nothing outside the row reaches into it.
export const focusPause = () => { focusRequest += 1; publish(); };

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
  let restored = false;
  let recordedAt: string | undefined;
  // The package goes back before the session does: importing a saved session
  // replays its tool calls, and their source refs resolve against whichever
  // package is current. Restoring the other way round would reject every ref.
  setPackage(previous.pkg);
  try {
    if (previous.saved) {
      recordedAt = parseFixture(previous.saved).recorded_at;
      await importSession(previous.saved);
    } else replaceState(createInitialState());
    restored = true;
  } catch {
    // Preserve recoverable storage and the pre-replay screen if restoration fails.
    replaceState(previous.before);
  }
  previous.unsubscribe();
  previous.replay.dispose();
  if (restored) saveNow(undefined, recordedAt);
  owner = undefined;
  publish();
}

export const leave = () => enqueue(detach);
const start = (fixture: Fixture, label: string, over?: RfqPackage) => {
  // Reject malformed input before touching the attached replay or its saved session.
  const validated = parseFixture(JSON.stringify(fixture));
  return enqueue(async () => {
    await detach();
    const saved = readSavedSession();
    const before = getState();
    const pkg = getPackage();
    // The sample recording cites the sample's own regions, so the sample
    // package goes under it; leaving hands the person's package back.
    if (over && over !== pkg) setPackage(over);
    const replay = createReplay(validated);
    owner = { replay, saved, before, pkg, label, recordedAt: validated.recorded_at, unsubscribe: replay.subscribe(publish) };
    replay.play();
    publish();
  });
};
export const startImported = (fixture: Fixture, label = 'Imported session') => start(fixture, label);
export const startSample = () => start(sampleSession, 'Sample session', samplePackage);
export const play = () => owner?.replay.play();
export const pause = () => owner?.replay.pause();
export const next = async () => await owner?.replay.next() ?? false;
export const restart = () => owner?.replay.restart();
