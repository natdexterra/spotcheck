import { executeTool } from '../webmcp-tools';
import type { ToolName } from '../webmcp-tools';
import { dispatchHuman, replaceState } from '../state/store';
import { createInitialState } from '../state/session';
import type { HumanAction } from '../state/types';

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
      await runStep(step);
      if (generation === startedGeneration) position++;
    } finally { busy = false; schedule(); }
    return true;
  };
  return {
    get position() { return position; },
    get playing() { return playing; },
    next, pause,
    play() { if (!disposed) { playing = true; schedule(); } },
    restart() { pause(); generation++; position = 0; replaceState(createInitialState()); },
    dispose() { pause(); disposed = true; },
  };
}
