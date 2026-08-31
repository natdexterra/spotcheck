import type { AppState, Candidate, DispatchedEvent } from './types';

export function reduce(state: AppState, event: DispatchedEvent): AppState {
  if (event.actor === 'agent' && event.action.type === 'propose') {
    const input = event.action.input as { field_id?: string; value?: string } | undefined;
    if (!input || typeof input.value !== 'string') return state;
    return { ...state, fields: state.fields.map(field => field.id === input.field_id && !field.locked && field.state !== 'conflict'
      ? { ...field, state: 'needs_review', value: input.value! }
      : field) };
  }
  if (event.actor === 'agent' && ['report_missing', 'report_conflict'].includes(event.action.type)) {
    const input = event.action.input as { field_id?: string; searched?: string[]; candidates?: Candidate[] } | undefined;
    if (!input) return state;
    return { ...state, fields: state.fields.map(field => field.id !== input.field_id || field.locked || (field.state === 'conflict' && event.action.type === 'report_missing') ? field
      : event.action.type === 'report_missing'
        ? { ...field, state: 'missing', searched: { searched: input.searched ?? [] } }
        : { ...field, state: 'conflict', candidates: input.candidates ?? [] }) };
  }
  return state;
}
