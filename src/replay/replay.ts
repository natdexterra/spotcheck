import { executeTool } from '../webmcp-tools';
import type { ToolName } from '../webmcp-tools';
import { dispatchHuman, getState, replaceState, subscribe } from '../state/store';
import { createInitialState, reviewSession } from '../state/session';
import type { FieldId, HumanAction } from '../state/types';

export type Step = { actor: 'agent'; at: number; call: { tool: ToolName; input: unknown } } |
  { actor: 'estimator'; at: number; action: HumanAction };
export interface Fixture { recorded_at: string; steps: Step[] }
const fixtures = import.meta.glob<Fixture>('../../data/sample-session*.json', { eager: true, import: 'default' });
export const sampleSession = fixtures['../../data/sample-session.json'] ?? fixtures['../../data/sample-session.stub.json']!;

export async function runStep(step: Step): Promise<void> {
  if (step.actor === 'agent') await executeTool(step.call.tool, step.call.input, step.at);
  else dispatchHuman({ ...step.action, at: step.at });
}

export function createReplay(source: Fixture = sampleSession) {
  const fixture = structuredClone(source);
  let position = 0;
  let playing = false;
  let busy = false;
  let disposed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  replaceState(createInitialState());
  const viewerHandled = new Set<FieldId>();
  let applyingFixture = false;
  let seen = 0;
  let lastFields = getState().fields;
  const unsubscribe = subscribe(() => {
    const state = getState();
    const log = reviewSession(state).log;
    if (!applyingFixture) for (const entry of log.slice(seen)) {
      if (entry.event.actor !== 'human') continue;
      const action = entry.event.action;
      const ids = 'field_id' in action && action.field_id ? [action.field_id] : action.type === 'send' ? action.covers ?? [] : [];
      // The reducer also logs no-op human actions; only a dispatch that actually
      // mutated the field (fresh object identity) counts as viewer-handled.
      for (const id of ids) {
        const after = state.fields.find(f => f.id === id);
        if (after?.locked && after !== lastFields.find(f => f.id === id)) viewerHandled.add(id);
      }
    }
    seen = log.length;
    lastFields = state.fields;
  });
  const pause = () => { playing = false; clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    if (!playing || disposed || busy || timer !== undefined) return;
    const step = fixture.steps[position];
    if (!step) { pause(); return; }
    timer = setTimeout(() => { timer = undefined; void next(); }, step.actor === 'agent' ? 900 : 1500);
  };
  const next = async (): Promise<boolean> => {
    if (busy || disposed) return false;
    clearTimeout(timer); timer = undefined;
    const step = fixture.steps[position];
    if (!step) { pause(); return false; }
    busy = true;
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
    } finally { applyingFixture = false; busy = false; schedule(); }
    return true;
  };
  return {
    get position() { return position; },
    get playing() { return playing; },
    next, pause,
    play() { if (!disposed) { playing = true; schedule(); } },
    restart() { pause(); generation++; position = 0; viewerHandled.clear(); seen = 0; replaceState(createInitialState()); },
    dispose() { pause(); disposed = true; unsubscribe(); },
  };
}
