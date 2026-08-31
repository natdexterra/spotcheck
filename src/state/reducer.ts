import type { AppState, DispatchedEvent } from './types';

export function reduce(state: AppState, event: DispatchedEvent): AppState {
  if (event.actor === 'agent' && event.action.type === 'propose') {
    const input = event.action.input as { field_id?: string; value?: string } | undefined;
    if (!input || typeof input.value !== 'string') return state;
    return { ...state, fields: state.fields.map(field => field.id === input.field_id
      ? { ...field, state: 'needs_review', value: input.value! }
      : field) };
  }
  return state;
}
