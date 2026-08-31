import type { AppState, DispatchedEvent } from './types';

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
