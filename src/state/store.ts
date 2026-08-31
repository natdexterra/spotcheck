// External store. React never owns this state: components subscribe through
// useSyncExternalStore; tools call dispatchAgent, UI actions call dispatchHuman.
import { reduce } from './reducer';
import { createInitialState } from './session';
import type { AgentAction, AppState, HumanAction } from './types';

let state: AppState = createInitialState();

export function replaceState(next: AppState): void {
  state = next;
  notify();
}

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function dispatchAgent(action: AgentAction): void {
  state = reduce(state, { actor: 'agent', action });
  notify();
}

export function dispatchHuman(action: HumanAction): void {
  state = reduce(state, { actor: 'human', action });
  notify();
}
