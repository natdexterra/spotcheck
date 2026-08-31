import type { AppState, DispatchedEvent, Field, FieldId } from './types';

export const FIELD_IDS: readonly FieldId[] = ['customer_rfq_ref', 'part_name', 'quantity', 'material',
  'stock_thickness', 'overall_dimensions', 'general_tolerance', 'surface_finish', 'drawing_number', 'drawing_revision', 'delivery'];
export const createInitialState = (): ReviewSession => ({ confirmed: false, log: [],
  fields: FIELD_IDS.map(id => ({ id, state: 'empty', value: null, locked: false,
    ...(id === 'overall_dimensions' ? { unit: null } : {}) })),
});
export const canConfirm = (state: AppState): boolean => state.fields.length === FIELD_IDS.length &&
  FIELD_IDS.every(id => state.fields.some(field => field.id === id && field.state === 'verified'));

export const isGap = (field: Field): boolean => field.state !== 'verified' &&
  (field.state === 'conflict' || field.state === 'missing' || field.ask_customer === true);
export const canDraft = (state: AppState): boolean => !state.confirmed && state.fields.some(isGap);

export interface LogEntry {
  actor: 'agent' | 'estimator';
  at: number;
  event: DispatchedEvent;
  notes?: string[];
  result?: Record<string, unknown>;
  diff?: { before: Draft; after: Draft };
}

export interface Draft { subject: string; body: string; covers: FieldId[] }

export interface ReviewSession extends AppState {
  log: LogEntry[];
  draft?: Draft;
  sent?: Draft;
  startedAt?: number;
  confirmedAt?: number;
}

export const reviewSession = (state: AppState): ReviewSession => ({
  ...state, log: (state as Partial<ReviewSession>).log ?? [],
});
