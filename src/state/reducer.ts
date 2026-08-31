// Stub identity reducer. The real state machine (transitions matrix, locks,
// invariants) is task P1; F1 only fixes the signature and the actor envelope.
import type { AppState, DispatchedEvent } from './types';

export function reduce(state: AppState, _event: DispatchedEvent): AppState {
  return state;
}
