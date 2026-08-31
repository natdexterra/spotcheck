import type { AppState, DispatchedEvent, Field } from './types';

export const isGap = (field: Field): boolean => field.state !== 'verified' &&
  (field.state === 'conflict' || field.state === 'missing' || field.ask_customer === true);
export const canDraft = (state: AppState): boolean => !state.confirmed && state.fields.some(isGap);

export interface LogEntry {
  actor: 'agent' | 'estimator';
  at: number;
  event: DispatchedEvent;
  notes?: string[];
  result?: Record<string, unknown>;
}

export interface ReviewSession extends AppState {
  log: LogEntry[];
}

export const reviewSession = (state: AppState): ReviewSession => ({
  ...state, log: (state as Partial<ReviewSession>).log ?? [],
});
