import { executeTool } from '../webmcp-tools';
import { resumePersistence, suspendPersistence } from './persistence';
import { parseFixture } from './serialization';
import type { ToolName } from '../webmcp-tools';
import { dispatchHuman, getState, replaceState, subscribe } from '../state/store';
import { createInitialState, reviewSession } from '../state/session';
import type { Field, FieldId, HumanAction } from '../state/types';

export type Step = { actor: 'agent'; at: number; call: { tool: ToolName; input: unknown } } |
  { actor: 'estimator'; at: number; action: HumanAction };
export interface Fixture { recorded_at: string; steps: Step[] }
const fixtures = import.meta.glob<Fixture>('../../data/sample-session*.json', { eager: true, import: 'default' });
export const sampleSession = fixtures['../../data/sample-session.json'] ?? fixtures['../../data/sample-session.stub.json']!;

export async function runStep(step: Step): Promise<void> {
  if (step.actor === 'agent') await executeTool(step.call.tool, step.call.input, step.at);
  else dispatchHuman({ ...step.action, at: step.at });
}

const contentChanged = (before: Field | undefined, after: Field): boolean => {
  if (!before) return true;
  const { locked: _b, ...b } = before;
  const { locked: _a, ...a } = after;
  return JSON.stringify(a) !== JSON.stringify(b);
};

export function createReplay(source: Fixture = sampleSession) {
  const fixture = parseFixture(JSON.stringify(source));
  let position = 0;
  let playing = false;
  let busy = false;
  let disposed = false;
  let error: string | undefined;
  let finishedByViewer = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const firstWrite = fixture.steps.find(step => step.actor === 'agent' && !['list_rfq_documents', 'read_document', 'get_review_state'].includes(step.call.tool));
  const last = fixture.steps.find(step => step.actor === 'estimator' && step.action.type === 'confirm') ?? fixture.steps.at(-1);
  const recordedMs = firstWrite && last ? Math.max(0, last.at - firstWrite.at) : 0;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  suspendPersistence();
  replaceState(createInitialState());
  const viewerHandled = new Set<FieldId>();
  // The fixture's `at` is a recording offset, not a time. Steps are stamped
  // with wall-clock times so badges, log clocks and "Reviewed in" read as the
  // run the viewer is watching; the offsets still drive the cadence.
  let startedAt: number | undefined;
  const stamped = (step: Step): Step => {
    startedAt ??= Date.now();
    return { ...step, at: startedAt + step.at };
  };
  let applyingFixture = false;
  let seen = 0;
  let lastFields = getState().fields;
  const unsubscribe = subscribe(() => {
    const state = getState();
    const log = reviewSession(state).log;
    if (!applyingFixture && state.confirmed && !finishedByViewer) {
      finishedByViewer = true;
      position = fixture.steps.length;
      pause();
    }
    if (!applyingFixture) for (const entry of log.slice(seen)) {
      if (entry.event.actor !== 'human') continue;
      const action = entry.event.action;
      const ids = 'field_id' in action && action.field_id ? [action.field_id] : action.type === 'send' ? action.covers ?? [] : [];
      // The reducer also logs no-op human actions, and a lock-only write
      // (edit_start, then cancel) is not handling either: the field counts as
      // viewer-handled only when its content beyond `locked` changed.
      for (const id of ids) {
        const after = state.fields.find(f => f.id === id);
        if (after?.locked && contentChanged(lastFields.find(f => f.id === id), after)) viewerHandled.add(id);
      }
    }
    seen = log.length;
    lastFields = state.fields;
  });
  const pause = () => { playing = false; clearTimeout(timer); timer = undefined; notify(); };
  const schedule = () => {
    if (!playing || disposed || busy || timer !== undefined) return;
    const step = fixture.steps[position];
    if (!step) { pause(); return; }
    timer = setTimeout(() => { timer = undefined; void next(); }, step.actor === 'agent' ? 900 : 1500);
  };
  const next = async (): Promise<boolean> => {
    if (busy || disposed || error || finishedByViewer) return false;
    clearTimeout(timer); timer = undefined;
    const recorded = fixture.steps[position];
    if (!recorded) { pause(); return false; }
    const step = stamped(recorded);
    busy = true;
    notify();
    const startedGeneration = generation;
    try {
      let nextStep = step;
      let dispatchReduced: (() => void) | undefined;
      if (step.actor === 'estimator') {
        const action = step.action;
        const ids = 'field_id' in action && action.field_id ? [action.field_id] : action.type === 'send' ? action.covers ?? [] : [];
        const overrides = ids.filter(id => viewerHandled.has(id));
        if (overrides.length === ids.length && overrides.length) {
          // D14: skip the whole step only when the viewer already handled every covered field.
          nextStep = { ...step, action: { ...action, replay_skip: `viewer handled ${overrides.join(', ')}` } };
        } else if (overrides.length && action.type === 'send') {
          // Partial coverage: log the dropped subset as a skip, then dispatch the reduced send.
          nextStep = { ...step, action: { ...action, covers: overrides, replay_skip: `viewer handled ${overrides.join(', ')}` } };
          const remaining = ids.filter(id => !viewerHandled.has(id));
          dispatchReduced = () => dispatchHuman({ ...action, covers: remaining, at: step.at });
        }
      }
      applyingFixture = true;
      const pending = runStep(nextStep);
      dispatchReduced?.();
      applyingFixture = false;
      await pending;
      if (generation === startedGeneration) position++;
    } catch (cause) {
      if (generation === startedGeneration) {
        error = cause instanceof Error ? cause.message : String(cause);
        pause();
      }
      return false;
    } finally {
      applyingFixture = false; busy = false;
      if (position === fixture.steps.length) pause();
      schedule(); notify();
    }
    return true;
  };
  return {
    get position() { return position; },
    get playing() { return playing; },
    get busy() { return busy; },
    get total() { return fixture.steps.length; },
    get ended() { return position === fixture.steps.length; },
    get error() { return error; },
    get finishedByViewer() { return finishedByViewer; },
    get recordedMs() { return recordedMs; },
    get nextStep() { return fixture.steps[position]; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    next, pause,
    play() { if (!disposed && !error && position < fixture.steps.length) { startedAt ??= Date.now(); playing = true; schedule(); notify(); } },
    restart() { if (disposed || busy) return; pause(); generation++; position = 0; error = undefined; finishedByViewer = false; startedAt = undefined; viewerHandled.clear(); seen = 0; replaceState(createInitialState()); notify(); },
    dispose() { pause(); if (!disposed) { disposed = true; unsubscribe(); resumePersistence(); } },
  };
}
